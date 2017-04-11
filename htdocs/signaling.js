navigator.getUserMedia = navigator.getUserMedia ||
    navigator.webkitGetUserMedia ||
    navigator.mozGetUserMedia;
window.RTCPeerConnection = window.webkitRTCPeerConnection ||
    window.mozRTCPeerConnection;
window.RTCSessionDescription = window.RTCSessionDescription ||
    window.mozRTCSessionDescription;
window.RTCIceCandidate = window.RTCIceCandidate || window.mozRTCIceCandidate;

var socket = io.connect(location.host);
var loginForm = document.getElementById('loginForm');
var peers = document.getElementById('peers');
var localStream;
var otherPeer;
var peerConnection;
var remoteStreamWrapper = document.getElementById('remoteStream');

loginForm.addEventListener('submit', function(event) {
    console.log('try to submit login form');
    var userName = document.getElementById('userName').value;
    if (userName) {
        navigator.getUserMedia(
            {
                audio: true,
                video: true
            },
            function(mediaStream) {
                console.log('success to get user media');
                var video = document.createElement('video');
                video.src = window.URL.createObjectURL(mediaStream);
                video.autoplay = true;
                document.getElementById('localStream').appendChild(video);
                localStream = mediaStream;
                console.log('try to emit login message');
                socket.emit(
                    'login',
                    {
                        userName: userName
                    }
                );
            },
            function(error) {
                console.log(error);
                alert('Cannot use a camera and/or a microphone.');
            }
        );
    }
    event.preventDefault();
});

socket.on('connect', function() {
    console.log('get connected to the signaling server');
    loginForm.style.display = 'block';
});

socket.on('joined', function() {
    console.log('get "joined" message');
    loginForm.style.display = 'none';
    peers.style.display = 'block';
});

socket.on('update peers', function(data) {
    console.log('get "update peers" message');
    while (peers.hasChildNodes()) {
        peers.removeChild(peers.lastChild);
    }
    data.forEach(function(peer) {
        var peerElement = document.createElement((peer.id == socket.id)? 'span': 'button');
        peerElement.dataset.id = peer.id;
        peerElement.appendChild(document.createTextNode(peer.userName));
        var li = document.createElement('li');
        li.appendChild(peerElement);
        peers.appendChild(li);
    });
});

var iceServers = [
    { urls: 'stun:stun.l.google.com:19302' }
];
function createPeerConnection(id) {
    otherPeer = id;
    peerConnection = new RTCPeerConnection({
        iceServers: iceServers
    });
    peerConnection.addStream(localStream);
    peerConnection.onicecandidate = function(event) {
        console.log('onicecandidate');
        if (event.candidate) {
            console.log('try to send conection candidate to the peer');
            socket.emit(
                'signaling',
                {
                    event: 'icecandidate',
                    to: otherPeer,
                    from: socket.id,
                    candidate: {
                        candidate: event.candidate.candidate,
                        sdpMLineIndex: event.candidate.sdpMLineIndex,
                        sdpMid: event.candidate.sdpMid
                    }
                }
            );
        }
    };
    peerConnection.onaddstream = function(event) {
        console.log('try to show peer\'s video stream');
        var video = document.createElement('video');
        video.src = window.URL.createObjectURL(event.stream);
        video.autoplay = true;
        remoteStreamWrapper.appendChild(video);
    };
    document.getElementById('bye').style.display = 'inline';
}

peers.addEventListener('click', function(event) {
    if (event.target.nodeName != 'BUTTON') return;
    if (peerConnection) bye();
    console.log('try to create RTCPeerConnection');
    createPeerConnection(event.target.dataset.id);
    console.log('try to create offer SDP');
    peerConnection.createOffer(
        function(description) {
            console.log('try to set created offer SDP as LocalDescription');
            peerConnection.setLocalDescription(
                new RTCSessionDescription(description),
                function() {
                    console.log('try to send offer SDP to a peer to talk with');
                    socket.emit(
                        'signaling',
                        {
                            event: 'offer',
                            from: socket.id,
                            to: otherPeer,
                            description: description
                        }
                    );
                },
                function(error) {
                    console.log(error);
                }
            );
        },
        function(error) {
            console.log(error);
        }
    );
});

socket.on('signaling', function(data) {
    console.log('get "signaling:' + data.event + '"');
    var func = signalingEvents[data.event];
    if (!!func &&  (data.event == 'offer' || data.from == otherPeer)) {
        func(data);
    }
});

var signalingEvents = {
    offer: function(data) {
        console.log('signalingEvents.offer');
        if (peerConnection) {
            console.log('reject');
            socket.emit('signaling', {
                event: 'busy',
                to: data.from,
                from: socket.id
            });
            return;
        }
        console.log('try to create RTCPeerConnection');
        createPeerConnection(data.from);
        console.log('try to set offer SDP as RemoteDescription');
        peerConnection.setRemoteDescription(
            new RTCSessionDescription(data.description),
            function() {
                console.log('try to create answer SDP for offer');
                peerConnection.createAnswer(
                    function(description) {
                        peerConnection.setLocalDescription(
                            new RTCSessionDescription(description),
                            function() {
                                console.log('try to send answer SDP to the caller');
                                socket.emit(
                                    'signaling',
                                    {
                                        event: 'answer',
                                        from: socket.id,
                                        to: otherPeer,
                                        description: description
                                    }
                                );
                            },
                            function(error) {
                                console.log(error);
                            }
                        );
                    },
                    function(error) {
                        console.log(error);
                    }
                )
            },
            function(error) {
                console.log(error);
            }
        );
    },
    answer: function(data) {
        console.log('try to the set sent SDP as RemoteDescription');
        peerConnection.setRemoteDescription(
            new RTCSessionDescription(data.description),
            function() {},
            function(error) {
                console.log(error);
            }
        );
    },
    busy: function() {
        console.log('peer talking');
        peerConnection = null;
    },
    icecandidate: function(data) {
        console.log('try to add the sent connection candidate to candidates');
        peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
    },
    bye: function() {
        console.log('end');
        bye();
    }
};

function bye() {
    remoteStreamWrapper.removeChild(remoteStreamWrapper.lastChild);
    document.getElementById('bye').style.display = 'none';
    peerConnection = null;
}

document.getElementById('bye').addEventListener('click', function() {
    socket.emit(
        'signaling',
        {
            event: 'bye',
            to: otherPeer,
            from: socket.id
        }
    );
    bye();
});
