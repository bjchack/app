// Firebase config (from you)
const firebaseConfig = {
  apiKey: "AIzaSyC7V_7aytfd-5PkaUKHi8wIZF9orJaanZk",
  authDomain: "videochatapp-fd75e.firebaseapp.com",
  projectId: "videochatapp-fd75e",
  storageBucket: "videochatapp-fd75e.firebasestorage.app",
  messagingSenderId: "587654231045",
  appId: "1:587654231045:web:c578f9887747a72d01586c",
  measurementId: "G-W6W35PMBY7"
};

// Init Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

const servers = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
};

let pc = new RTCPeerConnection(servers);
let localStream;
let remoteStream = new MediaStream();
const roomInput = document.getElementById('roomInput');

const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");
remoteVideo.srcObject = remoteStream;

navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then(stream => {
  localVideo.srcObject = stream;
  localStream = stream;
  stream.getTracks().forEach(track => pc.addTrack(track, stream));

  pc.ontrack = event => {
    event.streams[0].getTracks().forEach(track => remoteStream.addTrack(track));
  };
});

async function createRoom() {
  const roomRef = await db.collection("rooms").doc();
  roomInput.value = roomRef.id;

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  await roomRef.set({ offer: { type: offer.type, sdp: offer.sdp } });

  pc.onicecandidate = event => {
    if (event.candidate) {
      roomRef.collection("offerCandidates").add(event.candidate.toJSON());
    }
  };

  roomRef.onSnapshot(async snapshot => {
    const data = snapshot.data();
    if (!pc.currentRemoteDescription && data?.answer) {
      await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
    }
  });

  roomRef.collection("answerCandidates").onSnapshot(snapshot => {
    snapshot.docChanges().forEach(change => {
      if (change.type === "added") {
        pc.addIceCandidate(new RTCIceCandidate(change.doc.data()));
      }
    });
  });
}

async function joinRoom() {
  const roomId = roomInput.value;
  const roomRef = db.collection("rooms").doc(roomId);
  const roomSnapshot = await roomRef.get();

  if (roomSnapshot.exists) {
    const data = roomSnapshot.data();
    await pc.setRemoteDescription(new RTCSessionDescription(data.offer));

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await roomRef.update({ answer: { type: answer.type, sdp: answer.sdp } });

    pc.onicecandidate = event => {
      if (event.candidate) {
        roomRef.collection("answerCandidates").add(event.candidate.toJSON());
      }
    };

    roomRef.collection("offerCandidates").onSnapshot(snapshot => {
      snapshot.docChanges().forEach(change => {
        if (change.type === "added") {
          pc.addIceCandidate(new RTCIceCandidate(change.doc.data()));
        }
      });
    });
  }
}
