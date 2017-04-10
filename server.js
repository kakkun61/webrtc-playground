var express = require('express');
var app = express();
var server = require('http').Server(app);
server.listen(9000, '0.0.0.0');
app.use(express.static(__dirname + '/htdocs/'));

var io = require('socket.io')(server);
var peers = {};

io.on('connection', function(socket) {
    console.log('connection');
    socket.on('login', function(data) {
        console.log('login');
        if (data.userName) {
            peers[socket.id] = {
                id: socket.id,
                userName: data.userName,
                joined: new Date()
            };
            socket.emit('joined', true);
            updateMembers();
        }
    });

    socket.on('disconnect', function() {
        delete peers[socket.id];
        updateMembers();
    });

    socket.on('signaling', function(data) {
        console.log('signaling: ' + data.event);
        io.to(data.to).emit('signaling', data);
    });
})

function updateMembers() {
    var peerList = Object.keys(peers).map(function(key) {
        return peers[key];
    });
    peerList = peerList.sort(function (a, b) {
        return a.joined > b.joined;
    });
    io.emit('update peers', peerList);
}
