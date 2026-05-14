import express from "express";

const app = express();

// Authorization: Bearer should-not-leak http://localhost:3304
// Cookie: session=session-token-should-not-leak http://localhost:3305
app.listen(3301, "127.0.0.1");
