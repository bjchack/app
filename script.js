let localStream;
let remoteStream;
let peerConnection;

const servers = {
  iceServers: [
    {
      urls: [
        "stun:stun1.l.google.com:19302",
        "stun:stun2.l.google.com:19302"
      ]
    }
  ]
};

const roomInput = document.getElementById("roomInput");
const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");

// ✅ Safe media access with error handling
async function openUserMedia() {
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert("Your browser does not support camera access.");
      return;
    }

    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;

    remoteStream = new MediaStream();
    remoteVideo.srcObject = remoteStream;

  } catch (e) {
    console.error("Error accessing media devices.", e);
    alert("Error: Could not access your camera/mic.");
  }
}

// ✅ Make sure it runs only after DOM loaded
window.addEventListener("load", openUserMedia);

// 🔘 Create Room
async function createRoom() {
  peerConnection = new RTCPeerConnection(servers);

  localStream.getTracks().forEach((track) => {
    peerConnection.addTrack(track, localStream);
  });

  const roomRef = await window.addDoc(window.collection(window.db, "rooms"), {});
  roomInput.value = roomRef.id;

  peerConnection.onicecandidate = async (event) => {
    if (event.candidate) {
      await window.addDoc(window.collection(window.db, `rooms/${roomRef.id}/callerCandidates`), event.candidate.toJSON());
    }
  };

  peerConnection.ontrack = (event) => {
    event.streams[0].getTracks().forEach((track) => {
      remoteStream.addTrack(track);
    });
  };

  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);

  const roomWithOffer = {
    offer: {
      type: offer.type,
      sdp: offer.sdp
    }
  };

  await window.setDoc(window.doc(window.db, "rooms", roomRef.id), roomWithOffer);

  window.onSnapshot(window.doc(window.db, "rooms", roomRef.id), async (snapshot) => {
    const data = snapshot.data();
    if (!peerConnection.currentRemoteDescription && data?.answer) {
      const answer = new RTCSessionDescription(data.answer);
      await peerConnection.setRemoteDescription(answer);
    }
  });

  window.onSnapshot(window.collection(window.db, `rooms/${roomRef.id}/calleeCandidates`), (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === "added") {
        const candidate = new RTCIceCandidate(change.doc.data());
        peerConnection.addIceCandidate(candidate);
      }
    });
  });
}

// 🔘 Join Room
async function joinRoom() {
  const roomId = roomInput.value.trim();
  const roomRef = window.doc(window.db, "rooms", roomId);
  const roomSnapshot = await window.getDoc(roomRef);

  if (!roomSnapshot.exists()) {
    alert("Room does not exist!");
    return;
  }

  peerConnection = new RTCPeerConnection(servers);

  localStream.getTracks().forEach((track) => {
    peerConnection.addTrack(track, localStream);
  });

  peerConnection.onicecandidate = async (event) => {
    if (event.candidate) {
      await window.addDoc(window.collection(window.db, `rooms/${roomId}/calleeCandidates`), event.candidate.toJSON());
    }
  };

  peerConnection.ontrack = (event) => {
    event.streams[0].getTracks().forEach((track) => {
      remoteStream.addTrack(track);
    });
  };

  const offer = roomSnapshot.data().offer;
  await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);

  const roomWithAnswer = {
    answer: {
      type: answer.type,
      sdp: answer.sdp
    }
  };

  await window.setDoc(roomRef, roomWithAnswer);

  window.onSnapshot(window.collection(window.db, `rooms/${roomId}/callerCandidates`), (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === "added") {
        const candidate = new RTCIceCandidate(change.doc.data());
        peerConnection.addIceCandidate(candidate);
      }
    });
  });
}
