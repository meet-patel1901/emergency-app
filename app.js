// ================= FIREBASE CONFIG =================
const firebaseConfig = {
  apiKey: "AIzaSyCGgiCjgxvQio3PPZcMGq_XOzyjBCFwj_Q",
  authDomain: "emergency-793ca.firebaseapp.com",
  databaseURL: "https://emergency-793ca-default-rtdb.firebaseio.com",
  projectId: "emergency-793ca",
  storageBucket: "emergency-793ca.firebasestorage.app",
  messagingSenderId: "1044781707143",
  appId: "1:1044781707143:web:3148441e04ecdd82e7ed22",
  measurementId: "G-EGPS4BRMGX"
};
firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.database();

// ================= MESSAGE FUNCTION =================
function showMessage(msg, color = "red", duration = 3000) {
  const m = document.getElementById("message");
  if (m) {
    m.innerHTML = `<div style="
        padding:10px;
        border-radius:6px;
        margin-top:10px;
        background:${color === "green" ? "#d4edda" : "#f8d7da"};
        color:${color === "green" ? "#155724" : "#721c24"};
        font-weight:500;">${msg}</div>`;
    if (duration > 0) setTimeout(() => { m.innerHTML = ""; }, duration);
  }
}

// ================= REGISTER GROUP =================
window.registerGroup = function () {
  const groupName = document.getElementById("groupName").value.trim();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value.trim();

  if (!groupName || !email || !password) {
    showMessage("All fields are required.");
    return;
  }
  if (password.length < 6) {
    showMessage("Password must be at least 6 characters.");
    return;
  }

  auth.createUserWithEmailAndPassword(email, password)
    .then(cred => {
      const groupUid = cred.user.uid;
      // Save group info in DB
      db.ref(`groups/${groupUid}`).set({ groupName, email });
      showMessage(`Group Registered! <button onclick="goLogin()">Go to Login</button>`, "green", 0);
    })
    .catch(error => {
      if (error.code === "auth/email-already-in-use") {
        showMessage("This email is already registered.");
      } else showMessage(error.message);
    });
};

function goLogin() { window.location.href = "login.html"; }

// ================= MEMBER LOGIN =================
window.memberLogin = function () {
  const memberName = document.getElementById("memberName").value.trim();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value.trim();

  // Validation: Ensure all fields are filled and email is valid
  if (!memberName || !email || !password) {
    showMessage("All fields are required.");
    return;
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/; // Basic email validation
  if (!emailRegex.test(email)) {
    showMessage("Please enter a valid email address.");
    return;
  }

  // Debug: Log inputs
  console.log("Login inputs:", { memberName, email, password });

  // 1️⃣ Sign in member
  auth.signInWithEmailAndPassword(email, password)
    .then(cred => {
      const memberUid = cred.user.uid;
      localStorage.clear();  // Clear any stale data
      localStorage.setItem("memberName", memberName);
      localStorage.setItem("memberUid", memberUid);

      // Debug: Log auth UID
      console.log("Login: Auth UID =", cred.user.uid);

      // 2️⃣ Fetch group UID automatically using the email
      db.ref("groups").orderByChild("email").equalTo(email).once("value")
        .then(snapshot => {
          if (!snapshot.exists()) {
            showMessage("Group not found for this email.");
            return;
          }

          let groupUid = null;
          snapshot.forEach(groupSnap => {
            groupUid = groupSnap.key;
            console.log("Fetched Group UID =", groupUid); // Debug
          });
          localStorage.setItem("groupUid", groupUid);

          showMessage("Login Successful! Redirecting...", "green", 1000);
          setTimeout(() => { window.location.href = "dashboard.html"; }, 1000);
        })
        .catch(err => {
          console.error("Error fetching group info:", err); // Enhanced logging
          showMessage("Error fetching group info: " + err.message);
        });

    })
    .catch(error => {
      console.error("Login error:", error); // Enhanced logging
      showMessage("Invalid Email or Password: " + error.message);
    });
};

// ================= UPDATE STATUS =================
window.updateStatus = function (status) {
  const user = auth.currentUser;
  const memberName = localStorage.getItem("memberName");
  const memberUid = localStorage.getItem("memberUid");
  const groupUid = localStorage.getItem("groupUid");

  // Debug: Log all values
  console.log("Update Status Debug:", {
    authUid: user ? user.uid : "No user",
    memberName,
    memberUid,
    groupUid,
    status
  });

  if (!user || !memberName || !memberUid || !groupUid) {
    showMessage("Session expired. Please login again.");
    return;
  }

  const currentTime = new Date().toLocaleString();
  const timestamp = Date.now(); // store ms

  // Update only this member's status
  db.ref(`groups/${groupUid}/members/${memberUid}`).update({
    name: memberName,
    status: status,
    time: currentTime,
    timestamp: timestamp
  })
  .then(() => showMessage(`${memberName} is marked as ${status}`, status === "SAFE" ? "green" : "red"))
  .catch(error => {
    console.error("Update status error:", error); // Enhanced logging
    showMessage("Failed to update status: " + error.message);
  });
};

// ================= DISPLAY MEMBERS + RESET/REMOVE =================
auth.onAuthStateChanged(user => {
  const isDashboard = document.getElementById("memberList") !== null;
  if (!user && isDashboard) window.location.href = "login.html";

  if (isDashboard) {
    const groupUid = localStorage.getItem("groupUid");
    if (!groupUid) { showMessage("Group info missing."); return; }

    const membersRef = db.ref(`groups/${groupUid}/members`);
    const threeDays = 3 * 24 * 60 * 60 * 1000;

    // Function to remove inactive members (older than 3 days)
    const removeInactiveMembers = () => {
      membersRef.once("value").then(snapshot => {
        snapshot.forEach(child => {
          const data = child.val();
          if (data.timestamp && (Date.now() - data.timestamp > threeDays)) {
            membersRef.child(child.key).remove(); // Remove from DB and list
          }
        });
      });
    };

    // Run removal on page load
    removeInactiveMembers();

    // Live display of members (only active status-changers shown)
    membersRef.on("value", snapshot => {
      const list = document.getElementById("memberList");
      list.innerHTML = "";

      if (!snapshot.exists()) {
        list.innerHTML = "<div class='no-members'>No members have updated their status yet.</div>";
        console.log("No members in database."); // Debug
        return;
      }

      let activeMembers = [];
      snapshot.forEach(child => {
        const data = child.val();
        // Only include members who have actively updated (status set and time not default)
        if (data.status && data.status !== "NOT MARKED" && data.time && data.time !== "-") {
          activeMembers.push(data);
        }
      });

      console.log("Members displayed:", activeMembers.length); // Debug: Count of active members

      if (activeMembers.length === 0) {
        list.innerHTML = "<div class='no-members'>No members have updated their status yet.</div>";
        return;
      }

      // Display all active members
      activeMembers.forEach(data => {
        const card = document.createElement("div");
        card.className = "member-card";
        const statusIcon = data.status === "SAFE" ? "✅" : "🚨"; // Icons for interactivity
        card.innerHTML = `
          <div class="member-name">${data.name}</div>
          <div class="member-status ${data.status.toLowerCase()}">${statusIcon} ${data.status}</div>
          <div class="member-time">Updated: ${data.time}</div>
        `;
        list.appendChild(card);
      });
    });
  }
});

// ================= LOGOUT =================
window.logout = function () {
  auth.signOut().then(() => {
    localStorage.clear();
    window.location.href = "login.html";
  });
};