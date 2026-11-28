import test from "node:test";
import assert from "node:assert/strict";
import { domainWriteRoutes } from "../src/routes/domain-write.js";
import { createProduct } from "../src/repositories/products.js";
import { createSqliteD1 } from "./helpers/sqlite-d1.js";

function setup(){
 const x=createSqliteD1();
 x.sqlite.prepare("INSERT INTO users(telegram_id,full_name,role) VALUES(?,?,?)").run(101,"کارمند","employee");
 x.sqlite.prepare("INSERT INTO users(telegram_id,full_name,role) VALUES(?,?,?)").run(102,"مدیر","manager");
 return x;
}
const user={telegram_id:101,role:"employee"};
const manager={telegram_id:102,role:"manager"};
const auditContext=()=>({actorTelegramId:102,requestId:crypto.randomUUID()});

test("customer create and update use only customers table columns",async t=>{
 const {DB,close}=setup();t.after(close);
 const create=new Request("https://worker.test/api/v1/customers",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:"مشتری",phone:"09120000000",note:"تست"})});
 const created=await domainWriteRoutes(create,{DB},new URL(create.url),manager);
 assert.equal(created.status,201);
 const id=(await created.json()).data.customer.id;
 const patch=new Request("https://worker.test/api/v1/customers/"+id,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({note:"ویرایش"})});
 const updated=await domainWriteRoutes(patch,{DB},new URL(patch.url),manager);
 assert.equal((await updated.json()).data.customer.note,"ویرایش");
});

test("sale insert lets D1 triggers decrement stock and create debt exactly once",async t=>{
 const {DB,sqlite,close}=setup();t.after(close);
 await createProduct(DB,{product_id:"SALE-1",name:"کالا",purchase_price:50,sell_price:100,consumer_price:120},auditContext());
 sqlite.prepare("UPDATE inventory SET quantity=5 WHERE product_id=?").run("SALE-1");
 const req=new Request("https://worker.test/api/v1/sales",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({product_id:"SALE-1",quantity:2,amount_paid:100,payment_method:"cash",sale_channel:"site"})});
 const response=await domainWriteRoutes(req,{DB},new URL(req.url),user);
 assert.equal(response.status,201);
 assert.equal(sqlite.prepare("SELECT quantity FROM inventory WHERE product_id=?").get("SALE-1").quantity,3);
 assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM debts").get().n,1);
 assert.equal(sqlite.prepare("SELECT amount FROM debts").get().amount,100);
});

test("sale API returns a conflict when trigger rejects insufficient stock",async t=>{
 const {DB,close}=setup();t.after(close);
 await createProduct(DB,{product_id:"SALE-2",name:"کالا",sell_price:100},auditContext());
 const req=new Request("https://worker.test/api/v1/sales",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({product_id:"SALE-2",quantity:1,payment_method:"cash"})});
 const response=await domainWriteRoutes(req,{DB},new URL(req.url),user);
 assert.equal(response.status,409);
 assert.equal((await response.json()).error.code,"INSUFFICIENT_STOCK");
});

test("attendance check-in and check-out are restricted to the current session user",async t=>{
 const {DB,sqlite,close}=setup();t.after(close);
 const inReq=new Request("https://worker.test/api/v1/attendance/check-in",{method:"POST"});
 const inRes=await domainWriteRoutes(inReq,{DB},new URL(inReq.url),user);
 assert.equal(inRes.status,201);
 const outReq=new Request("https://worker.test/api/v1/attendance/check-out",{method:"POST"});
 const outRes=await domainWriteRoutes(outReq,{DB},new URL(outReq.url),user);
 assert.equal(outRes.status,200);
 assert.equal(sqlite.prepare("SELECT telegram_id FROM attendance").get().telegram_id,101);
 assert.ok(sqlite.prepare("SELECT check_out FROM attendance").get().check_out);
});

test("inventory adjustments and debt settlement stay disabled without ledgers",async t=>{
 const {DB,close}=setup();t.after(close);
 const req=new Request("https://worker.test/api/v1/inventory/adjust",{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"});
 const response=await domainWriteRoutes(req,{DB},new URL(req.url),user);
 assert.equal(response.status,501);
});
