# Express.js error-handling middleware brief: best practices and common pitfalls

## Summary
Express error-handling relies on a dedicated **4-argument** middleware (`(err, req, res, next)`) placed **after** your routes/middleware. Ensure you route errors to it using **`next(err)`** for async failures (or rely on Express 5’s Promise handling), set appropriate **status codes**, and include a **404** handler. Common pitfalls include placing the error handler too early, forgetting `next(err)` in async code, and not differentiating error middleware from normal middleware.

## How Express catches errors
- Express catches errors that occur **synchronously** in route handlers and middleware without extra work (i.e., a thrown error is handled by Express). (Express docs: “Errors that occur in synchronous code…require no extra work.”)
- For **asynchronous** work triggered inside route handlers/middleware, you must pass errors to Express by calling **`next(err)`**. If you omit that, Express won’t automatically catch those errors because they are outside the synchronous call stack. (Express docs)
- **Express 5:** route handlers/middleware that **return Promises** will automatically call `next(value)` when they reject/throw, so rejected Promises flow to error handlers. (Express docs; also backed by an Express 5 test example showing `Promise.reject(...)` reaching an error handler)

## Defining error-handling middleware (the “4 arguments” rule)
- Error-handling middleware must have the signature **`function(err, req, res, next)`** (i.e., it must have **exactly 4 parameters**). Express/Connect differentiates error handlers from normal middleware by `fn.length`. (Express wiki migration notes)
- The error handler should be defined **below** all other middleware/routes so it can receive errors passed via `next(err)`. (Express wiki migration notes)

### Minimal example pattern
From the Express 2.x→3.x migration wiki (shows the core chaining idea):
```js
app.use(express.bodyParser())
app.use(express.cookieParser())
app.use(express.session())
app.use(app.router)

app.use(function(err, req, res, next){
  res.send(500, { error: 'Sorry something bad happened!' });
})
```
(Express wiki migrating-from-2.x-to-3.x)

## Best practices for responses
### Use error objects with status codes
- A common pattern is to create an Error and attach a **`status`** field, then the error handler responds using `err.status || 500`. (Express example: “web-service/index.js” shows `err.status = status` and later `res.status(err.status || 500)`) 

### Provide content negotiation when appropriate
- For production-grade pages/APIs, use different response formats (e.g., HTML vs JSON) and set a consistent 404 handler. (Express example: “error-pages/index.js” demonstrates `res.format` for 404 and an error handler for 500)

## Suggested middleware order
1. Normal middleware and routes
2. A **404** handler for unmatched routes
3. The **error-handling** middleware `(err, req, res, next)`

The “error-pages” example shows 404 handling via middleware that responds with status 404 and uses `res.format`, followed by an error handler that renders a 500 page. (Express example: “error-pages/index.js”)

## Common pitfalls
- **Forgetting to call `next(err)`** in async code that doesn’t return a Promise. Express docs emphasize that errors in async code invoked by route handlers must be caught and passed to Express; otherwise Express won’t catch them. (Express docs)
- **Using the wrong middleware signature** (e.g., not having exactly 4 arguments). Express/Connect uses `fn.length` to identify error middleware. (Express wiki migration notes)
- **Registering the error handler in the wrong order** (before routes/middleware). Error handlers must be defined *below* other middleware so `next(err)` can reach them. (Express wiki migration notes)

## Express routing for Promise-based async (Express 5 note)
- Express 5 will route **rejected Promises** to error handlers automatically when middleware/handlers return Promises. (Express docs; also demonstrated in an Express test example where `Promise.reject(new Error('boom!'))` is caught by the error handler.)

## Practical checklist
| Topic | What to do | Evidence |
|---|---|---|
| Error handler definition | Use `(err, req, res, next)` with exactly 4 args | Express wiki notes about `fn.length` |
| Placement | Put error handler after routes/middleware | Express wiki notes (“defined below all the others”) |
| Async errors | For async code, call `next(err)` (unless returning a Promise in Express 5) | Express docs (“must pass them to the next() function”) |
| Status codes | Attach `err.status` and respond with `err.status || 500` | Express “web-service/index.js” example |
| 404 handling | Add a terminal 404 middleware before the error handler | Express “error-pages/index.js” example |
| Promise-based async (Express 5) | Return Promises so Express passes rejections automatically | Express docs + Express test example |

## Source links (from evidence)
- Express docs: https://expressjs.com/en/guide/error-handling/
- Express wiki (migration notes, 4-arg rule and ordering): https://github.com/expressjs/express/wiki/Migrating-from-2.x-to-3.x
- Example JSON API with error handler: https://github.com/expressjs/express/blob/master/express/examples/web-service/index.js
- Production error pages example: https://github.com/expressjs/express/blob/master/examples/error-pages/index.js
- Express 5 Promise rejection test example: https://github.com/expressjs/express/blob/master/test/app.router.js