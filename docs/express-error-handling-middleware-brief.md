# Express error-handling middleware brief

Express.js error-handling middleware: best practices and common pitfalls





## Best Practices



- **Define Error-Handling Middleware at the End**: Place error-handling middleware after all other app.use() calls to ensure it catches errors passed via `next(err)`.

- **Use 4-Argument Middleware for Errors**: Ensure error-handling middleware has the signature `(err, req, res, next)` to differentiate it from regular middleware.

- **Centralized Error Response Handling**: Implement a centralized error response handler to manage different types of errors consistently.



  ```javascript

  app.use(function(err, req, res, next){

    res.status(err.status || 500);

    res.send({ error: err.message });

  });

  ```



- **Environment-Aware Error Handling**: Provide verbose error details in development and minimalistic responses in production.



  ```javascript

  if (app.settings.env === 'production') app.disable('verbose errors');

  ```



- **Content-Type Negotiation**: Handle errors differently based on the requested content type (HTML vs JSON).



  ```javascript

  res.format({

    html: function () { res.render('404', { url: req.url }) },

    json: function () { res.json({ error: 'Not found' }) },

    default: function () { res.type('txt').send('Not found') }

  });

  ```



## Common Pitfalls



- **Forgetting to Define Error-Handling Middleware**: Ensure you have defined error-handling middleware to catch and process errors.

- **Improper Middleware Order**: Error-handling middleware should be defined after all other middleware and routes to catch errors properly.

- **Not Using 4-Argument Middleware**: Failing to use the correct signature `(err, req, res, next)` can result in errors not being caught.

- **Inconsistent Error Responses**: Avoid inconsistent error responses by centralizing error handling logic.

- **Exposing Sensitive Information**: Be cautious about exposing sensitive information in error responses, especially in production environments.



## Example: Comprehensive Error Handling



```javascript

app.enable('verbose errors');



if (app.settings.env === 'production') app.disable('verbose errors');



app.use(function(req, res, next){

  res.status(404);

  res.format({

    html: function () { res.render('404', { url: req.url }) },

    json: function () { res.json({ error: 'Not found' }) },

    default: function () { res.type('txt').send('Not found') }

  });

});



app.use(function(err, req, res, next){

  res.status(err.status || 500);

  res.render('500', { error: err });

});

```