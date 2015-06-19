var socket = io.connect();

// using single socket for RTCMultiConnection signaling
var onMessageCallbacks = {};
socket.on('message', function(data) {
    if(data.sender == connection.userid) return;
    if (onMessageCallbacks[data.channel]) {
        onMessageCallbacks[data.channel](data.message);
    };
});

// initializing RTCMultiConnection constructor.
function initRTCMultiConnection(userid) {
    var connection = new RTCMultiConnection();
    connection.body = document.getElementById('videos-container');
    connection.channel = connection.sessionid = connection.userid = userid || connection.userid;
    connection.session = {
        video: document.getElementById('broadcast-options').value == 'Video',
        screen: document.getElementById('broadcast-options').value == 'Screen',
        oneway: true
    };
    connection.sdpConstraints.mandatory = {
        OfferToReceiveAudio: false,
        OfferToReceiveVideo: true
    };
    // using socket.io for signaling
    connection.openSignalingChannel = function (config) {
        var channel = config.channel || this.channel;
        onMessageCallbacks[channel] = config.onmessage;
        if (config.onopen) setTimeout(config.onopen, 1000);
        return {
            send: function (message) {
                socket.emit('message', {
                    sender: connection.userid,
                    channel: channel,
                    message: message
                });
            },
            channel: channel
        };
    };
    connection.onMediaError = function(error) {
        alert( JSON.stringify(error) );
    };
    return connection;
}

// this RTCMultiConnection object is used to connect with existing users
var connection = initRTCMultiConnection();

connection.onstream = function(event) {
    connection.body.appendChild(event.mediaElement);

    if(connection.isInitiator == false && !connection.broadcastingConnection) {
        // "connection.broadcastingConnection" global-level object is used
        // instead of using a closure object, i.e. "privateConnection"
        // because sometimes out of browser-specific bugs, browser
        // can emit "onaddstream" event even if remote user didn't attach any stream.
        // such bugs happen often in chrome.
        // "connection.broadcastingConnection" prevents multiple initializations.

        // if current user is broadcast viewer
        // he should create a separate RTCMultiConnection object as well.
        // because node.js server can allot him other viewers for
        // remote-stream-broadcasting.
        connection.broadcastingConnection = initRTCMultiConnection(connection.userid);
        connection.broadcastingConnection.attachStreams.push(event.stream); // broadcast remote stream
        connection.broadcastingConnection.dontCaptureUserMedia = true;
        connection.broadcastingConnection.sdpConstraints.mandatory.OfferToReceiveVideo = false;
        connection.broadcastingConnection.open({
            dontTransmit: true
        });
    }
};

// ask node.js server to look for a broadcast
// if broadcast is available, simply join it. i.e. "join-broadcaster" event should be emitted.
// if broadcast is absent, simply create it. i.e. "start-broadcasting" event should be fired.
document.getElementById('open-or-join').onclick = function() {
    var broadcastid = document.getElementById('broadcast-id').value;
    if(broadcastid.replace(/^\s+|\s+$/g, '').length <= 0) {
        alert('Please enter broadcast-id');
        document.getElementById('broadcast-id').focus();
        return;
    }

    this.disabled = true;
    socket.emit('join-broadcast', {
        broadcastid: broadcastid,
        userid: connection.userid
    });
};

// this event is emitted when a broadcast is already created.
socket.on('join-broadcaster', function(broadcaster) {
    connection.channel = connection.sessionid = broadcaster.userid;
    connection.join({
        sessionid: broadcaster.userid,
        userid: broadcaster.userid,
        extra: {},
        session: connection.session
    });
});

// this event is emitted when a broadcast is absent.
socket.on('start-broadcasting', function() {
    connection.sdpConstraints.mandatory.OfferToReceiveVideo = false;
    connection.open({
        dontTransmit: true
    });
});
