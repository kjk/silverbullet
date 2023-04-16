import { serve } from "https://deno.land/std@0.134.0/http/mod.js";
import { DB } from "../mod.js";
const db = new DB();
db.query(`
  CREATE TABLE visits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT NOT NULL,
    visited_at TEXT NOT NULL
  )
`);
const addVisitQuery = db.prepareQuery(
  "INSERT INTO visits (url, visited_at) VALUES (:url, :time)"
);
const countVisitsQuery = db.prepareQuery(
  "SELECT COUNT(*) FROM visits WHERE url = :url"
);
console.log("Running server on localhost:8080");
await serve(
  (req) => {
    addVisitQuery.execute({
      url: req.url,
      time: new Date(),
    });
    const [count] = countVisitsQuery.one({ url: req.url });
    return new Response(`This page was visited ${count} times!`);
  },
  { port: 8080 }
);
