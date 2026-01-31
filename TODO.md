MCP Server
- Add an MCP Server to Durable for giving recommended products based on user's purchase history
- On login, system connects to MCP server and retrieves an array of products (name, cost, sku) which the frontend saves in localstorage
- MCP server should have all appropriate security protocols in place
- For now, MCP server is just a stub that returns an array of 5 hardcoded products
- Server should be written in typescript/Node.js
- Add all appropriate tests
- In this environment, there should be one MCP server for devlocal and one for CI
- Now add a "Recommended for you" section to the bottom of the order page below the submit button that displays the name, cost, sku of each product on a separate         
  line. Don't connect them up yet, just display.

Products
- Add a database table "products" with (id, name, cost, sku)
- Pre-populate with the stubbed products from the MCP server stub, as well as products from the tests
- Order page should now be a dropdown of products from the database, alphabetically
- Total price becomes calculated based on the user selected quantity
- When a user clicks on an item from the Recommended list, it should select that item in the dropdown
- Submit order now includes id and sku
- Add/modify all appropriate tests