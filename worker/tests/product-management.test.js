import test from "node:test";
import assert from "node:assert/strict";
import { validateProductDraft } from "../src/validation/products.js";
import { createProduct, updateProduct, listProducts } from "../src/repositories/products.js";
import { productWriteRoutes } from "../src/routes/products.js";
import { canManage } from "../src/auth/permissions.js";
import { router } from "../src/router.js";

function makeDb() {
  const state = { product: null, prices: null, quantity: 0, queries: [] };
  const db = {
    prepare(sql) {
      const statement = {
        sql, values: [],
        bind(...values) { this.values = values; return this; },
        async first() {
          state.queries.push({ sql: this.sql, values: this.values });
          if (this.sql.includes("COUNT(*)")) return { total: state.product ? 1 : 0 };
          if (this.sql.includes("FROM products p") && this.sql.includes("WHERE p.product_id=?")) {
            if (!state.product || state.product.product_id !== this.values[0]) return null;
            return { ...state.product, ...(state.prices || {}), quantity: state.quantity };
          }
          return null;
        },
        async all() {
          state.queries.push({ sql: this.sql, values: this.values });
          return { results: state.product ? [{ ...state.product, ...(state.prices || {}), quantity: state.quantity }] : [] };
        },
      };
      return statement;
    },
    async batch(statements) {
      for (const statement of statements) {
        state.queries.push({ sql: statement.sql, values: statement.values });
        if (statement.sql.startsWith("INSERT INTO products")) {
          const [product_id,name,unit,package_quantity,weight,weight_unit,description] = statement.values;
          if (state.product?.product_id === product_id) throw new Error("UNIQUE constraint failed: products.product_id");
          state.product = { product_id,name,unit,package_quantity,weight,weight_unit,description };
          state.prices = { purchase_price:0,sell_price:0,consumer_price:0,market_price:0 };
          state.quantity = 0; // Mirrors trg_product_initialize.
        } else if (statement.sql.startsWith("UPDATE product_prices")) {
          const [purchase_price,sell_price,consumer_price,market_price] = statement.values;
          state.prices = { purchase_price,sell_price,consumer_price,market_price };
        } else if (statement.sql.startsWith("UPDATE products SET")) {
          const fields = statement.sql.slice("UPDATE products SET ".length).split(" WHERE ")[0].split(", ");
          fields.forEach((assignment,index) => { state.product[assignment.split("=")[0]] = statement.values[index]; });
        }
      }
      return [];
    },
    state,
  };
  return db;
}

test("product draft validation follows the current schema and rejects unsupported fields", () => {
  assert.deepEqual(validateProductDraft({
    product_id:"P-100",name:"مایع شوینده",unit:"عدد",purchase_price:120,sell_price:150,
  },{creating:true}),{});
  assert.ok(validateProductDraft({product_id:"P-1",name:"",purchase_price:-1},{creating:true}).name);
  assert.ok(validateProductDraft({product_id:"P-1",name:"کالا",barcode:"123"},{creating:true}).barcode);
  assert.ok(validateProductDraft({product_id:"P-1",name:"کالا" }).product_id);
});

test("product creation writes base data and prices in one D1 batch while trigger owns initial stock", async () => {
  const db=makeDb();
  const product=await createProduct(db,{
    product_id:"P-100",name:"مایع شوینده",unit:"عدد",package_quantity:2,weight:1.5,weight_unit:"لیتر",
    description:"توضیح",purchase_price:120,sell_price:150,consumer_price:160,market_price:155,
  });
  assert.equal(product.product_id,"P-100");
  assert.equal(product.sell_price,150);
  assert.equal(product.quantity,0);
  assert.equal(db.state.queries.filter(q=>q.sql.startsWith("INSERT INTO products")||q.sql.startsWith("UPDATE product_prices")).length,2);
  assert.equal(db.state.queries.some(q=>/UPDATE inventory|INSERT INTO inventory/i.test(q.sql)),false);
});

test("product update persists editable fields and prices without changing stock or product identifier", async () => {
  const db=makeDb();
  await createProduct(db,{product_id:"P-200",name:"مایع",unit:"عدد",purchase_price:100,sell_price:120});
  const updated=await updateProduct(db,"P-200",{name:"مایع جدید",sell_price:135});
  assert.equal(updated.name,"مایع جدید");
  assert.equal(updated.sell_price,135);
  assert.equal(updated.purchase_price,100);
  assert.equal(updated.quantity,0);
  assert.equal(db.state.queries.some(q=>/UPDATE inventory/i.test(q.sql)),false);
});

test("product search supports name and identifier plus stock filters with bound parameters", async () => {
  const db=makeDb();
  const result=await listProducts(db,new URL("https://worker.test/api/v1/products?q=P-2&stock=in_stock&limit=10&offset=0"));
  const query=db.state.queries.find(q=>q.sql.includes("p.name LIKE"));
  assert.deepEqual(query.values,["%P-2%","%P-2%",10,0]);
  assert.match(query.sql,/p\.product_id LIKE \?/);
  assert.match(query.sql,/COALESCE\(i\.quantity,0\) > 0/);
  assert.equal(result.pagination.limit,10);
});

test("only owner and manager can manage products", () => {
  assert.equal(canManage("owner"),true);
  assert.equal(canManage("manager"),true);
  assert.equal(canManage("employee"),false);
  assert.equal(canManage("unknown"),false);
});

test("employee cannot create products and invalid drafts are rejected", async () => {
  const db=makeDb();
  const request=new Request("https://worker.test/api/v1/products",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({product_id:"P-1",name:"کالا"})});
  const denied=await productWriteRoutes(request,{DB:db},new URL(request.url),{role:"employee"});
  assert.equal(denied.status,403);
  assert.equal(db.state.product,null);

  const invalidRequest=new Request("https://worker.test/api/v1/products",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({product_id:"P-1",name:"",barcode:"123"})});
  const invalid=await productWriteRoutes(invalidRequest,{DB:db},new URL(invalidRequest.url),{role:"owner"});
  assert.equal(invalid.status,400);
  assert.equal(db.state.product,null);
});

test("manager product creation returns the persisted D1 record", async () => {
  const db=makeDb();
  const request=new Request("https://worker.test/api/v1/products",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({product_id:"P-300",name:"شوینده",unit:"عدد",purchase_price:80,sell_price:100})});
  const response=await productWriteRoutes(request,{DB:db},new URL(request.url),{role:"manager"});
  const body=await response.json();
  assert.equal(response.status,201);
  assert.equal(body.data.product.product_id,"P-300");
  assert.equal(body.data.product.sell_price,100);
});


test("private product write route rejects requests without a valid session", async () => {
  const response = await router(
    new Request("https://worker.test/api/v1/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product_id: "P-401", name: "کالا" }),
    }),
    { SITE_AUTH_KV: { async get() { return null; } } },
  );
  assert.equal(response.status, 401);
  const body = await response.json();
  assert.equal(body.error.code, "UNAUTHORIZED");
});
