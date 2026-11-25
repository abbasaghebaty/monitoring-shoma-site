import test from "node:test";
import assert from "node:assert/strict";
import { validateProductDraft } from "../src/validation/products.js";
import { createProduct, updateProduct, getProduct, listProducts, ProductNoChangesError } from "../src/repositories/products.js";
import { productWriteRoutes } from "../src/routes/products.js";
import { canManage } from "../src/auth/permissions.js";
import { router } from "../src/router.js";
import { createSqliteD1 } from "./helpers/sqlite-d1.js";

function setup(){const testDb=createSqliteD1();testDb.sqlite.prepare("INSERT INTO users(telegram_id,full_name,role) VALUES(?,?,?)").run(1001,"Test Manager","manager");return testDb;}
const user={telegram_id:1001,role:"manager"};

test("product validation accepts only columns in the live products and product_prices tables",()=>{
 assert.deepEqual(validateProductDraft({product_id:"P-1",name:"شوینده",unit:"عدد",purchase_price:10,sell_price:15},{creating:true}),{});
 assert.ok(validateProductDraft({product_id:"P-1",name:"کالا",barcode:"123"},{creating:true}).barcode);
 assert.ok(validateProductDraft({product_id:"P-1",name:"کالا",min_stock:5},{creating:true}).min_stock);
 assert.ok(validateProductDraft({product_id:"P-1",name:""},{creating:true}).name);
});

test("create uses product trigger to initialize price and inventory rows",async t=>{
 const {DB,sqlite,close}=setup();t.after(close);
 const p=await createProduct(DB,{product_id:"P-1",name:"مایع",unit:"عدد",purchase_price:120,sell_price:150,consumer_price:160,market_price:155});
 assert.equal(p.product_id,"P-1");assert.equal(p.sell_price,150);
 assert.equal(sqlite.prepare("SELECT quantity FROM inventory WHERE product_id=?").get("P-1").quantity,0);
 assert.equal(sqlite.prepare("SELECT purchase_price FROM product_prices WHERE product_id=?").get("P-1").purchase_price,120);
});

test("product update changes only supported fields and preserves independent inventory",async t=>{
 const {DB,sqlite,close}=setup();t.after(close);
 await createProduct(DB,{product_id:"P-2",name:"مایع",sell_price:120,purchase_price:80});
 sqlite.prepare("UPDATE inventory SET quantity=9 WHERE product_id=?").run("P-2");
 const updated=await updateProduct(DB,"P-2",{sell_price:135,description:"توضیح"});
 assert.equal(updated.sell_price,135);assert.equal(updated.purchase_price,80);assert.equal(updated.quantity,9);assert.equal(updated.description,"توضیح");
});

test("no-op product update is rejected",async t=>{
 const {DB,close}=setup();t.after(close);
 await createProduct(DB,{product_id:"P-3",name:"کالا",sell_price:50});
 await assert.rejects(updateProduct(DB,"P-3",{sell_price:50}),ProductNoChangesError);
});

test("product list search and stock filter use actual inventory table",async t=>{
 const {DB,sqlite,close}=setup();t.after(close);
 await createProduct(DB,{product_id:"P-4",name:"شوینده"});
 sqlite.prepare("UPDATE inventory SET quantity=4 WHERE product_id=?").run("P-4");
 const result=await listProducts(DB,new URL("https://worker.test/api/v1/products?q=P-4&stock=in_stock"));
 assert.equal(result.items.length,1);assert.equal(result.items[0].quantity,4);
});

test("product create API works for all valid authenticated roles",async t=>{
 const {DB,close}=setup();t.after(close);
 const req=new Request("https://worker.test/api/v1/products",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({product_id:"P-5",name:"کالای جدید",sell_price:99})});
 const response=await productWriteRoutes(req,{DB},new URL(req.url),{...user,role:"employee"});
 assert.equal(response.status,201);
 assert.equal((await response.json()).data.product.product_id,"P-5");
});

test("unknown roles cannot manage products",()=>{
 assert.equal(canManage("owner"),true);assert.equal(canManage("manager"),true);assert.equal(canManage("employee"),true);assert.equal(canManage("admin"),false);
});

test("unauthenticated API calls are rejected before data access",async()=>{
 const req=new Request("https://worker.test/api/v1/products");
 const response=await router(req,{SITE_AUTH_KV:{async get(){return null;}}});
 assert.equal(response.status,401);
});
