var express = require('express');
var app = express();
var server = require('http').Server(app);
server.listen(9000, '0.0.0.0');
app.use(express.static(__dirname + '/htdocs/'));
