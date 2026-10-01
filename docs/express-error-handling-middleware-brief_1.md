# Express Error Handling Middleware Brief

**Summary:** Proper error handling in Express.js requires a centralized, catch-all middleware defined with four arguments `(err, req, res, next)` placed at the end of your middleware chain. While synchronous errors thrown by route handlers are caught automatically, asynchronous errors must be explicitly passed to `next()`. Starting with Express 5+, rejected Promises from async functions are also automatically caught and routed to error handlers.



## Best Practices



- **Define a Catch-All Middleware:** Create an error-handling middleware with four arguments `(err, req, res, next)` and place it at the very end of your middleware chain. This allows you to catch all unhandled errors in one place, log them, and return a consistent HTTP 500 response to the caller `[Reddit]`.

- **Use Custom Error Objects:** Instead of throwing raw strings or generic `Error` objects, create helper functions that generate custom error instances with specific status codes. Your catch-all middleware can then check for this property (e.g., `res.status(err.status || 500)`) to return the appropriate HTTP response `[GitHub Examples]`.

- **Handle Asynchronous Errors Correctly:** If your route handlers or middleware invoke asynchronous functions, you must catch errors in those functions and pass them to Express via `next(error)` `[Express Docs]`. Alternatively, using async/await or returning Promises that reject will automatically call `next(value)` in Express 5+ `[Express Docs]`.

- **Negotiate Content Types:** Use methods like `res.format()` within your error handlers to return different response formats based on the client's request (e.g., rendering an HTML page for browsers versus returning a JSON payload for API clients) `[GitHub Examples]`.



## Common Pitfalls



- **Ignoring Asynchronous Error Propagation:** Forgetting to catch errors inside asynchronous callbacks or promises and pass them to `next()` can cause unhandled rejections, especially in Express versions prior to 5 where rejected Promises are not automatically caught by the router `[Express Docs]`.

- **Incorrect Middleware Ordering:** Placing error-handling middleware before route handlers or other regular middleware will prevent it from catching errors thrown during request processing. Note that a non-error 404 handler (with three arguments) should be placed after routes but *before* the final error-handling middleware `[GitHub Examples]`.

- **Not Distinguishing Expected vs. Unexpected Errors:** Throwing generic `Error` objects for expected failures (like validation errors or missing API keys) without setting a status code means Express will default to a 500 Internal Server Error, masking application-level issues as server crashes `[GitHub Examples]`.