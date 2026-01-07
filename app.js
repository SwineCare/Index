        // Firebase Configuration
        
const firebaseConfig = {
  apiKey: "AIzaSyBAKTPpU7RsfqIrOrp9o98JnCL-RbUVWNs",
  authDomain: "capstone-996a3.firebaseapp.com",
  databaseURL: "https://capstone-996a3-default-rtdb.firebaseio.com",
  projectId: "capstone-996a3",
  storageBucket: "capstone-996a3.firebasestorage.app",
  messagingSenderId: "297091452987",
  appId: "1:297091452987:web:a68ccf7b53b6b69d80cc1e",
  measurementId: "G-DKVPP635XC"
};

// END FIREBASE CONFIGURATION

        // Initialize Firebase
        firebase.initializeApp(firebaseConfig);
        const auth = firebase.auth();
        const database = firebase.database();
        const firestore = firebase.firestore();

        // Enable Firebase persistence
        auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL)
            .catch((error) => {
                console.error("Error setting persistence:", error);
            });

        // Global Variables
        let currentUser = null;
        let currentPigToSell = null;
        let currentPigToDelete = null;
        let currentPigToEdit = null;
        let currentPigForHistory = null;
        let charts = {};
        let chartInstances = {};
        let simulationInterval;
        let pig_temp = null;
        let ambient_temp = null;
        let ambient_humidity = null;

        // Authentication Functions
        function showLogin() {
            destroyAllCharts();
            document.getElementById('loginPage').style.display = 'block';
            document.getElementById('registerPage').style.display = 'none';
            document.getElementById('forgotPasswordPage').style.display = 'none';
        }

        function showRegister() {
            destroyAllCharts();
            document.getElementById('loginPage').style.display = 'none';
            document.getElementById('registerPage').style.display = 'block';
            document.getElementById('forgotPasswordPage').style.display = 'none';
        }

        function showForgotPassword() {
            document.getElementById('loginPage').style.display = 'none';
            document.getElementById('registerPage').style.display = 'none';
            document.getElementById('forgotPasswordPage').style.display = 'block';
        }

        function destroyChart(chartId) {
            if (chartInstances[chartId]) {
                chartInstances[chartId].destroy();
                delete chartInstances[chartId];
            }
        }

        function destroyAllCharts() {
            Object.keys(chartInstances).forEach(chartId => {
                destroyChart(chartId);
            });
        }

        document.getElementById('loginForm').addEventListener('submit', async (e) => {
            e.preventDefault();

            const email = document.getElementById('loginEmail').value;
            const password = document.getElementById('loginPassword').value;
            const rememberMe = document.getElementById('rememberMe').checked;

            try {
                // Try only the login
                const userCredential = await auth.signInWithEmailAndPassword(email, password);
                currentUser = userCredential.user;

            } catch (error) {
                // Only trigger when login fails
                showNotification('Incorrect Email/Password', 'error');
                return; // stop execution
            }

            // Only run this if login was successful
            if (rememberMe) {
                localStorage.setItem('rememberMe', 'true');
                localStorage.setItem('userEmail', email);
            } else {
                localStorage.removeItem('rememberMe');
                localStorage.removeItem('userEmail');
            }

            showMainApp();
            startDataSimulation();
            showNotification('Welcome back to SwineCare!', 'success');
        });


        // Register Form Handler
        document.getElementById('registerForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('registerName').value;
            const email = document.getElementById('registerEmail').value;
            const password = document.getElementById('registerPassword').value;
            const confirmPassword = document.getElementById('confirmPassword').value;

            if (password !== confirmPassword) {
                showNotification('Passwords do not match', 'error');
                return;
            }

            try {
                const userCredential = await auth.createUserWithEmailAndPassword(email, password);
                await userCredential.user.updateProfile({ displayName: name });

                await firestore.collection('users').doc(userCredential.user.uid).set({
                    name: name,
                    email: email,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });

                currentUser = userCredential.user;
                showMainApp();
                startDataSimulation();
                showNotification('Account created successfully! Welcome to SwineCare!', 'success');
            } catch (error) {
                showNotification(`Registration failed: ${error.message}`, 'error');
            }
        });

        // Forgot Password Handler
        document.getElementById('forgotPasswordForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('resetEmail').value;

            try {
                await auth.sendPasswordResetEmail(email);
                showNotification('Password reset email sent successfully!', 'success');
                showLogin();
            } catch (error) {
                showNotification(`Reset failed: ${error.message}`, 'error');
            }
        });

        // Main App Functions
        function showMainApp() {
            document.getElementById('authContainer').style.display = 'none';
            document.getElementById('appContainer').style.display = 'flex';

            const displayName = currentUser.displayName || 'Farmer';
            document.getElementById('userName').textContent = displayName;
            document.getElementById('userAvatar').textContent = displayName.charAt(0).toUpperCase();

            loadPigs();
            setupRealtimeListeners();

            setTimeout(() => {
                initializeCharts();
            }, 100);
        }

        function logout() {
            destroyAllCharts();

            auth.signOut();
            stopDataSimulation();
            document.getElementById('authContainer').style.display = 'flex';
            document.getElementById('appContainer').style.display = 'none';
            showLogin();
            showNotification('Logged out successfully', 'success');
        }

        // Navigation
        function showPage(pageId) {
            const pages = document.querySelectorAll('.page-content');
            pages.forEach(page => page.classList.remove('active'));

            document.getElementById(pageId + 'Page').classList.add('active');

            const navLinks = document.querySelectorAll('.nav-link');
            navLinks.forEach(link => link.classList.remove('active'));
            event.target.classList.add('active');

            const titles = {
                'dashboard': 'Dashboard',
                'pigs': 'Hog Management',
                'comparison': 'Hog Comparison',
                'statistics': 'Environmental Statistics',
                'notifications': 'Notifications',
                'reports': 'Reports',
                'settings': 'Camera Settings'
            };
            document.getElementById('pageTitle').textContent = titles[pageId];
        }

        // Store last valid readings
        let lastPigTemp = 0;
        let lastHumidity = 0;
        let lastAmbientTemp = 0;

        // IoT Data Simulation
        function startDataSimulation() {
            simulationInterval = setInterval(() => {
                if (ambient_temp) {
                    ambient_temp = parseFloat(ambient_temp).toFixed(2);
                }
                updateSensorData(pig_temp, ambient_humidity, ambient_temp);
                checkHealthAlerts();
            }, 5000);

            updateSensorData(pig_temp, ambient_humidity, ambient_temp);
        }

        function stopDataSimulation() {
            if (simulationInterval) {
                clearInterval(simulationInterval);
            }
        }

        function updateSensorData(pig_temp, H, ambient_temp) {
            if (!currentUser) return;

            // Keep last valid readings — prevent null / undefined
            if (pig_temp !== null && pig_temp !== undefined && pig_temp !== "") {
                lastPigTemp = parseFloat(pig_temp);
            }
            if (H !== null && H !== undefined && H !== "") {
                lastHumidity = parseFloat(H);
            }
            if (ambient_temp !== null && ambient_temp !== undefined && ambient_temp !== "") {
                lastAmbientTemp = parseFloat(ambient_temp);
            }

            // Display last valid values
            document.getElementById('temperature').innerHTML =
                `${lastAmbientTemp}<span class="stat-unit">°C</span>`;

            document.getElementById('humidity').innerHTML =
                `${lastHumidity}<span class="stat-unit">%</span>`;

            document.getElementById('pigBodyTemp').innerHTML =
                `${lastPigTemp}<span class="stat-unit">°C</span>`;

            // Save to Firebase
            const timestamp = Date.now();
            const sensorData = {
                temperature: lastAmbientTemp,
                humidity: lastHumidity,
                pigBodyTemp: lastPigTemp,
                timestamp: timestamp,
                userId: currentUser.uid
            };

            database.ref(`sensorData/${currentUser.uid}/${timestamp}`).set(sensorData);
        }


        function checkHealthAlerts() {
            const temperature = parseFloat(document.getElementById('temperature').textContent);
            const humidity = parseFloat(document.getElementById('humidity').textContent);
            const pigBodyTemp = parseFloat(document.getElementById('pigBodyTemp').textContent);

            if (temperature > 35) {
                addNotification('High Temperature Alert', `Temperature is ${temperature}°C - Above normal range`, 'warning');
            }

            if (humidity > 85) {
                addNotification('High Humidity Alert', `Humidity is ${humidity}% - Risk of disease`, 'warning');
            }

            if (pigBodyTemp > 40) {
                addNotification('Pig Health Alert', `Pig body temperature is ${pigBodyTemp}°C - Possible fever`, 'error');
            }
        }

        // Camera Settings - Store URLs
        let CAMERA_URLS = {
            behavior: "http://cam_stream.local:81/stream"
        };

        let THERMAL_WS_URL = "ws://heatmap/thermal";
        let CONTROL_WS_URL = "ws://heatmap/control";

        const DEFAULT_CAMERA_URLS = {
            behavior: "http://cam_stream.local:81/stream",
            thermal: "ws://heatmap/thermal",
            control: "ws://heatmap/control"
        };

        let controlConnecting = false;

        const camImg = document.getElementById('camImg');
        const thermalContainer = document.getElementById('thermalContainer');
        const camPlaceholder = document.getElementById('camPlaceholder');

        const canvas = document.getElementById('canvas');
        const ctx = canvas.getContext('2d');

        const cols = 32, rows = 24;
        const smallCanvas = document.createElement('canvas');
        smallCanvas.width = cols;
        smallCanvas.height = rows;
        const smallCtx = smallCanvas.getContext('2d');

        let thermalWs = null;
        let controlWs = null;

        let controlConnected = false;
        let controlQueue = [];
        let controlReconnectDelay = 1000;
        const CONTROL_MAX_RECONNECT_DELAY = 30000;

        let processing = false;

        // Load saved camera settings from localStorage
        function loadCameraSettings() {
            const savedSettings = localStorage.getItem('cameraSettings');
            if (savedSettings) {
                try {
                    const settings = JSON.parse(savedSettings);
                    CAMERA_URLS.behavior = settings.behavior || DEFAULT_CAMERA_URLS.behavior;
                    THERMAL_WS_URL = settings.thermal || DEFAULT_CAMERA_URLS.thermal;
                    CONTROL_WS_URL = settings.control || DEFAULT_CAMERA_URLS.control;
                } catch (error) {
                    console.error('Error loading camera settings:', error);
                }
            }
            updateCurrentSettingsDisplay();
        }

        // Save camera settings to localStorage
        function saveCameraSettings() {
            const settings = {
                behavior: CAMERA_URLS.behavior,
                thermal: THERMAL_WS_URL,
                control: CONTROL_WS_URL
            };
            localStorage.setItem('cameraSettings', JSON.stringify(settings));
        }

        // Update current settings display
        function updateCurrentSettingsDisplay() {
            const behaviorDisplay = document.getElementById('currentBehaviorURL');
            const thermalDisplay = document.getElementById('currentThermalURL');
            const controlDisplay = document.getElementById('currentControlURL');

            if (behaviorDisplay) behaviorDisplay.textContent = CAMERA_URLS.behavior;
            if (thermalDisplay) thermalDisplay.textContent = THERMAL_WS_URL;
            if (controlDisplay) controlDisplay.textContent = CONTROL_WS_URL;

            // Update form inputs
            const behaviorInput = document.getElementById('behaviorCameraURL');
            const thermalInput = document.getElementById('thermalCameraURL');
            const controlInput = document.getElementById('controlWebSocketURL');

            if (behaviorInput) behaviorInput.value = CAMERA_URLS.behavior;
            if (thermalInput) thermalInput.value = THERMAL_WS_URL;
            if (controlInput) controlInput.value = CONTROL_WS_URL;
        }

        // Camera Settings Form Handler
        document.addEventListener('DOMContentLoaded', () => {
            const cameraForm = document.getElementById('cameraSettingsForm');
            if (cameraForm) {
                cameraForm.addEventListener('submit', (e) => {
                    e.preventDefault();

                    const behaviorURL = document.getElementById('behaviorCameraURL').value.trim();
                    const thermalURL = document.getElementById('thermalCameraURL').value.trim();
                    const controlURL = document.getElementById('controlWebSocketURL').value.trim();

                    // Validate URLs
                    if (!behaviorURL || !thermalURL || !controlURL) {
                        showNotification('Please fill in all camera URLs', 'error');
                        return;
                    }

                    // Update URLs
                    CAMERA_URLS.behavior = behaviorURL;
                    THERMAL_WS_URL = thermalURL;
                    CONTROL_WS_URL = controlURL;

                    // Save to localStorage
                    saveCameraSettings();

                    // Reconnect with new URLs
                    stopThermalFeed();
                    if (controlWs) {
                        controlWs.close();
                        controlWs = null;
                    }

                    connectControlWS();

                    updateCurrentSettingsDisplay();
                    showNotification('Camera settings saved successfully! Reconnecting...', 'success');

                    // Refresh camera feed if on dashboard
                    const dashboardPage = document.getElementById('dashboardPage');
                    if (dashboardPage && dashboardPage.classList.contains('active')) {
                        setTimeout(() => {
                            switchCamera('behavior');
                        }, 1000);
                    }
                });
            }

            // Load settings on page load
            loadCameraSettings();
        });

        // Open Reset Confirmation Modal
        function resetCameraSettings() {
            const modal = document.getElementById('resetConfirmModal');
            modal.classList.add('show');
        }

        // Close Reset Confirmation Modal
        function closeResetConfirmModal() {
            const modal = document.getElementById('resetConfirmModal');
            modal.classList.remove('show');
        }

        // Confirm Reset Settings
        function confirmResetSettings() {
            CAMERA_URLS.behavior = DEFAULT_CAMERA_URLS.behavior;
            THERMAL_WS_URL = DEFAULT_CAMERA_URLS.thermal;
            CONTROL_WS_URL = DEFAULT_CAMERA_URLS.control;

            saveCameraSettings();
            updateCurrentSettingsDisplay();

            // Reconnect
            stopThermalFeed();
            if (controlWs) {
                controlWs.close();
                controlWs = null;
            }
            connectControlWS();

            closeResetConfirmModal();
            showNotification('Settings reset to default values successfully!', 'success');

            // Update connection status after a delay
            setTimeout(() => {
                testCameraConnections();
            }, 2000);
        }

        // Close modal when clicking outside
        window.addEventListener('click', (event) => {
            const resetModal = document.getElementById('resetConfirmModal');
            if (event.target === resetModal) {
                closeResetConfirmModal();
            }
        });

        // Test camera connections
        async function testCameraConnections() {
            showNotification('Testing connections...', 'info');

            const behaviorStatus = document.getElementById('behaviorStatus');
            const thermalStatus = document.getElementById('thermalStatus');
            const controlStatus = document.getElementById('controlStatus');

            // Test Behavior Camera
            behaviorStatus.textContent = 'Testing...';
            behaviorStatus.style.color = '#FF9800';

            try {
                const response = await fetch(CAMERA_URLS.behavior, { method: 'HEAD', mode: 'no-cors' });
                behaviorStatus.textContent = 'Connected ✓';
                behaviorStatus.style.color = '#4CAF50';
            } catch (error) {
                behaviorStatus.textContent = 'Failed ✗';
                behaviorStatus.style.color = '#F44336';
            }

            // Test Thermal WebSocket
            thermalStatus.textContent = 'Testing...';
            thermalStatus.style.color = '#FF9800';

            const testThermalWs = new WebSocket(THERMAL_WS_URL);
            testThermalWs.onopen = () => {
                thermalStatus.textContent = 'Connected ✓';
                thermalStatus.style.color = '#4CAF50';
                testThermalWs.close();
            };
            testThermalWs.onerror = () => {
                thermalStatus.textContent = 'Failed ✗';
                thermalStatus.style.color = '#F44336';
            };

            // Test Control WebSocket
            controlStatus.textContent = controlConnected ? 'Connected ✓' : 'Testing...';
            controlStatus.style.color = controlConnected ? '#4CAF50' : '#FF9800';

            if (!controlConnected) {
                setTimeout(() => {
                    controlStatus.textContent = controlConnected ? 'Connected ✓' : 'Failed ✗';
                    controlStatus.style.color = controlConnected ? '#4CAF50' : '#F44336';
                }, 3000);
            }

            showNotification('Connection test completed', 'success');
        }

        // Update connection status periodically
        setInterval(() => {
            const controlStatusEl = document.getElementById('controlStatus');
            if (controlStatusEl) {
                controlStatusEl.textContent = controlConnected ? 'Connected ✓' : 'Disconnected ✗';
                controlStatusEl.style.color = controlConnected ? '#4CAF50' : '#F44336';
            }
        }, 5000);

        function connectControlWS(url = CONTROL_WS_URL) {
            if (controlWs && (controlWs.readyState === WebSocket.OPEN || controlWs.readyState === WebSocket.CONNECTING)) {
                return;
            }
            controlConnecting = true;

            try {
                controlWs = new WebSocket(url);
                controlWs.onopen = () => {
                    console.log('[ControlWS] connected');
                    controlConnected = true;
                    controlConnecting = false;
                    controlReconnectDelay = 1000;
                    while (controlQueue.length) {
                        const m = controlQueue.shift();
                        _sendControlNow(m);
                    }
                };

                controlWs.onmessage = (evt) => { console.log('[ControlWS] recv:', evt.data); };

                controlWs.onclose = (evt) => {
                    console.warn('[ControlWS] closed', 'code=', evt.code, 'reason=', evt.reason);
                    controlConnected = false;
                    controlWs = null;
                    controlConnecting = false;
                    setTimeout(() => {
                        controlReconnectDelay = Math.min(CONTROL_MAX_RECONNECT_DELAY, Math.floor(controlReconnectDelay * 1.5));
                        connectControlWS(url);
                    }, controlReconnectDelay);
                };

                controlWs.onerror = (err) => {
                    console.error('[ControlWS] error', err);
                };

            } catch (err) {
                console.error('[ControlWS] connect exception', err);
                controlConnected = false;
                controlConnecting = false;
            }
        }

        function _sendControlNow(out) {
            if (!controlWs || controlWs.readyState !== WebSocket.OPEN) {
                controlQueue.push(out);
                return;
            }
            try {
                controlWs.send(out);
                console.log('[ControlWS] sent', out);
            } catch (e) {
                console.error('[ControlWS] send failed, queueing', e);
                controlQueue.push(out);
            }
        }

        function sendControl(payload) {
            const out = (typeof payload === 'object') ? JSON.stringify(payload) : String(payload);

            if (controlWs && controlWs.readyState === WebSocket.OPEN && controlConnected) {
                _sendControlNow(out);
                return;
            }

            controlQueue.push(out);
            console.warn('[ControlWS] not connected — queued command:', out);

            if (!controlWs || controlWs.readyState === WebSocket.CLOSED) {
                if (!controlConnecting) connectControlWS();
            }
        }

        connectControlWS();

        function switchCamera(type) {
            if (type === 'behavior') {
                // stopThermalFeed();
                camImg.src = CAMERA_URLS.behavior;
                camImg.style.display = "block";
                thermalContainer.style.display = "none";
                camPlaceholder.style.display = "none";
            } else if (type === 'thermal') {
                camImg.style.display = "none";
                camPlaceholder.style.display = "none";
                thermalContainer.style.display = "block";
                // startThermalFeed();
            }
        }

        function startThermalFeed() {
            if (thermalWs && thermalWs.readyState === WebSocket.OPEN) return;
            thermalWs = new WebSocket(THERMAL_WS_URL);
            thermalWs.binaryType = "arraybuffer";

            thermalWs.onopen = () => console.log("[ThermalWS] Thermal connected");
            thermalWs.onclose = () => {
                console.warn("[ThermalWS] Disconnected, retrying...");
                setTimeout(startThermalFeed, 2000);
            };

            thermalWs.onmessage = async (e) => {
                if (e.data instanceof ArrayBuffer) {
                    const floats = new Float32Array(e.data);
                    if (floats.length === cols * rows) {
                        drawFloatFrame(floats);
                    }
                    return;
                }

                try {
                    let text;
                    if (typeof e.data === "string") {
                        text = e.data;
                    } else if (e.data instanceof Blob) {
                        text = await e.data.text();
                    } else {
                        return;
                    }

                    const obj = JSON.parse(text);

                    if (obj && obj.type === "ta" && obj.ta !== undefined) {
                        const taVal = Number(obj.ta);
                        if (Number.isFinite(taVal)) {
                            ambient_temp = taVal;
                        }
                    } else if (obj && obj.type === "dht" && obj.humidity !== undefined) {
                        const humVal = Number(obj.humidity);
                        if (Number.isFinite(humVal)) {
                            ambient_humidity = humVal;
                        }
                    } else if (obj && obj.type === "meta") {
                        if (obj.ta !== undefined) {
                            const taVal = Number(obj.ta);
                            if (Number.isFinite(taVal)) ambient_temp = taVal;
                        }
                        if (obj.humidity !== undefined) {
                            const humVal = Number(obj.humidity);
                            if (Number.isFinite(humVal)) ambient_humidity = humVal;
                        }
                    }
                } catch (err) {
                    console.warn("[ThermalWS] Failed to parse text message:", err);
                }
            };
        }

        function stopThermalFeed() {
            if (thermalWs) {
                try { thermalWs.close(); } catch (e) { }
                thermalWs = null;
            }
        }

        stopThermalFeed();
        startThermalFeed();

        function lerp(a, b, t) { return a + (b - a) * t; }

        function getColorForValue(val, vminLocal, vmaxLocal, cmap = 'turbo') {
            if (!isFinite(val)) return [0, 0, 0, 255];
            if (vminLocal === vmaxLocal) { vminLocal -= 0.5; vmaxLocal += 0.5; }
            const t = Math.max(0, Math.min(1, (val - vminLocal) / (vmaxLocal - vminLocal)));
            const stops = [
                [0.0, [48, 18, 59]],
                [0.25, [18, 102, 173]],
                [0.5, [28, 179, 128]],
                [0.75, [248, 182, 35]],
                [1.0, [181, 0, 0]]
            ];
            for (let i = 0; i < stops.length - 1; i++) {
                const t0 = stops[i][0], t1 = stops[i + 1][0];
                if (t >= t0 && t <= t1) {
                    const local = (t - t0) / (t1 - t0);
                    const c0 = stops[i][1], c1 = stops[i + 1][1];
                    return [
                        Math.round(lerp(c0[0], c1[0], local)),
                        Math.round(lerp(c0[1], c1[1], local)),
                        Math.round(lerp(c0[2], c1[2], local)),
                        255
                    ];
                }
            }
            return [255, 0, 255, 255];
        }

        function drawFloatFrame(floats) {
            if (processing) return;
            processing = true;

            let obsMin = Infinity, obsMax = -Infinity;
            for (const v of floats) {
                if (isFinite(v)) {
                    if (v < obsMin) obsMin = v;
                    if (v > obsMax) obsMax = v;
                }
            }

            pig_temp = isFinite(obsMax) ? obsMax.toFixed(2) : '-';

            const vmin = isFinite(obsMin) ? obsMin : 0;
            const vmax = isFinite(obsMax) ? obsMax : vmin + 1;

            const img = smallCtx.createImageData(cols, rows);
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    const idx = r * cols + c;
                    const v = floats[idx];
                    const col = getColorForValue(v, vmin, vmax, 'turbo');
                    const p = idx * 4;
                    img.data[p + 0] = col[0];
                    img.data[p + 1] = col[1];
                    img.data[p + 2] = col[2];
                    img.data[p + 3] = 255;
                }
            }
            smallCtx.putImageData(img, 0, 0);

            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.save();
            ctx.imageSmoothingEnabled = false;
            ctx.translate(canvas.width, 0);
            ctx.scale(-1, 1);
            ctx.drawImage(smallCanvas, 0, 0, canvas.width, canvas.height);
            ctx.restore();

            processing = false;
        }

        document.addEventListener("DOMContentLoaded", () => {
            switchCamera('behavior');
            loadCameraSettings();
        });

        function toggleFeeder() {
            const isEnabled = document.getElementById('feederSwitch').checked;
            showNotification(`Automatic Feeder ${isEnabled ? 'Enabled' : 'Disabled'}`, 'success');

            if (currentUser) {
                database.ref(`controls/${currentUser.uid}/feeder`).set({
                    enabled: isEnabled,
                    lastUpdated: Date.now()
                });
            }
        }

        function setupAppListener() {
            // This gets the state from the UI checkbox
            const isEnabled = document.getElementById('showerSwitch').checked;
            let isFeederToggled = document.getElementById('feederSwitch').checked;

            if (currentUser) {
                // 1. REAL-TIME LISTENER (Keeps the switch updated instantly when DB changes)
                const showerSwitch = document.getElementById('showerSwitch');
                database.ref(`controls/${currentUser.uid}/shower/enabled`).on('value', (snapshot) => {
                    const isEnabled = snapshot.val();

                    if (showerSwitch) {
                        showerSwitch.checked = !!isEnabled;
                        // console.log("[EVENT] Database changed: Shower is now", isEnabled ? "Enabled" : "Disabled");
                    }
                });

                const feederSwitch = document.getElementById('feederSwitch');
                database.ref(`controls/${currentUser.uid}/feeder/enabled`).on('value', (snapshot) => {
                    const _isFeederToggle = snapshot.val();

                    if (feederSwitch) {
                        feederSwitch.checked = !!_isFeederToggle;
                    }
                });
                // 2. AUTOMATION: Check pig temperature and toggle shower
                // We listen to the latest sensor data entry

                database.ref(`sensorData/${currentUser.uid}`).limitToLast(1).on('child_added', (snapshot) => {
                    const data = snapshot.val();
                    const isShowerOn = !!showerSwitch.checked;
                    if (data) {
                        // document.getElementById('temperature').innerHTML = `${data.temperature}<span class="stat-unit">°C</span>`;
                        // document.getElementById('humidity').innerHTML = `${data.humidity}<span class="stat-unit">%</span>`;
                        // document.getElementById('pigBodyTemp').innerHTML = `${data.pigBodyTemp}<span class="stat-unit">°C</span>`;

                        // NOTE: Ensure 'pigTemp' matches exactly your database field name (e.g. 'temperature', 'temp', 'pigTemp')
                        const currentTemp = data ? (data.pigBodyTemp || data.temperature) : null;

                        // CASE: High Temp -> Turn ON (if not already on)
                        if (currentTemp >= 41 && !isShowerOn) {
                            console.log(`[AUTO] High Temp detected (${currentTemp}°C). Activating Shower.`);

                            database.ref(`controls/${currentUser.uid}/shower`).set({
                                enabled: true,
                                lastUpdated: Date.now()
                            });

                            sendControl({ cmd: 'valve', state: 'off', target: 'shower', uid: currentUser.uid, ts: Date.now() });
                            showNotification(`High Temp (${currentTemp}°C)! Shower Auto-Activated`, 'warning');
                        }

                        // // CASE: Normal Temp -> Turn OFF (if currently on)
                        // If the shower was activated by manual, then don't turn it off. Wait for it.
                        else if (currentTemp < 41 && isShowerOn) {
                            const manualBtn = document.getElementById('manualShowerBtn');
                            const manualShowerAvailable = manualBtn && (manualBtn.innerText?.includes("Shower Now"));
                            console.log(`[AUTO] Temp returned to normal (${currentTemp}°C). Deactivating Shower.`);

                            // It should be not processing.
                            if (manualShowerAvailable) {
                                database.ref(`controls/${currentUser.uid}/shower`).set({
                                    enabled: false,
                                    lastUpdated: Date.now()
                                });

                                sendControl({ cmd: 'valve', state: 'on', target: 'shower', uid: currentUser.uid, ts: Date.now() });
                                showNotification(`Temp Normal (${currentTemp}°C). Shower Auto-Deactivated`, 'success');
                            }

                        }
                    }
                });

                // 3. Get the time from the feeding schedule, and based on that time, if the current time is the same as the exact time.
                // then it will send control to the manual feeder. As well as when the current time is the same as the end time.
                // So it will activate the feeder twice.

                // REPLACING YOUR CURRENT BLOCK WITH THIS NEW ONE:
                firestore.collection("systemControls")
                    .doc("feedingSchedule")
                    .onSnapshot((doc) => { // CHANGED .get() to .onSnapshot()
                        if (doc.exists) {
                            const data = doc.data();
                            const startTime = data.start || "08:00";
                            const endTime = data.end || "16:00";

                            console.log("Loaded & Monitoring Schedule:", data);

                            // --- AUTO-FEEDER LOGIC ---
                            // Clear existing interval if any (to prevent duplicates on updates)
                            if (window.feedingInterval) clearInterval(window.feedingInterval);

                            window.feedingInterval = setInterval(() => {
                                const now = new Date();
                                // Get current time in HH:mm format (24-hour)
                                const currentHours = String(now.getHours()).padStart(2, '0');
                                const currentMinutes = String(now.getMinutes()).padStart(2, '0');
                                const currentTime = `${currentHours}:${currentMinutes}`;
                                const currentSeconds = now.getSeconds();

                                isFeederToggled = document.getElementById('feederSwitch').checked;

                                // Check if we are in the "00" seconds of the minute to trigger nicely once per minute
                                if (!isFeederToggled) return;
                                if (currentSeconds === 0) {
                                    if (currentTime === startTime) {
                                        console.log(`[AUTO-FEED] Time matched START (${startTime}). Feeding now!`);
                                        manualFeed(document.querySelector('button[onclick*="manualFeed"]'));
                                    }
                                    else if (currentTime === endTime) {
                                        console.log(`[AUTO-FEED] Time matched END (${endTime}). Feeding now!`);
                                        manualFeed(document.querySelector('button[onclick*="manualFeed"]'));
                                    }
                                }
                            }, 1000); // Check every second

                        } else {
                            console.log("No saved schedule found.");
                        }
                    }, (error) => { // Error callback for onSnapshot
                        console.error("Error loading schedule:", error);
                    });
            }
        }


        // ----------------------------------------------
        // 🔔 OPTIONAL NOTIFICATION FUNCTION
        // ----------------------------------------------
        function showNotification(message, type = "success") {
            console.log(`[${type.toUpperCase()}] ${message}`);
            // You can replace this with your custom toast notification UI
            alert(message);
        }

        // ----------------------------------------------
        // 📥 LOAD FEEDING SCHEDULE ON PAGE LOAD
        // ----------------------------------------------
        document.addEventListener("DOMContentLoaded", function () {
            loadFeedingSchedule();
        });

        function loadFeedingSchedule() {
            firestore.collection("systemControls")
                .doc("feedingSchedule")
                .get()
                .then((doc) => {
                    if (doc.exists) {
                        const data = doc.data();

                        document.getElementById("feedSchedule").value = data.start || "08:00";
                        document.getElementById("feedSchedule2").value = data.end || "16:00";

                        console.log("Loaded schedule:", data);
                    } else {
                        console.log("No saved schedule found.");
                    }
                })
                .catch((error) => {
                    console.error("Error loading schedule:", error);
                });
        }

        // ----------------------------------------------
        // 💾 SAVE FEEDING SCHEDULE TO FIRESTORE
        // ----------------------------------------------
        function saveFeedingSchedule() {
            const startTime = document.getElementById("feedSchedule").value;
            const endTime = document.getElementById("feedSchedule2").value;

            if (!startTime || !endTime) {
                showNotification("Please set both start and end time.", "error");
                return;
            }

            firestore.collection("systemControls")
                .doc("feedingSchedule")
                .set({
                    start: startTime,
                    end: endTime,
                    updatedAt: new Date()
                })
                .then(() => {
                    showNotification("Feeding schedule saved successfully!", "success");
                })
                .catch((error) => {
                    console.error("Error saving schedule:", error);
                    showNotification("Failed to save schedule.", "error");
                });
        }

        function manualFeed(btn) {
            // THIS IS BASED ON THE ESP32 LOGIC, AND CHANGING THIS WILL NOT CHANGE THE DURATION OF THE SERVO.
            // TO CHANGE THE DURATION    OR COOLDOWN OF THE SERVO OR FEED, U NEED TO EDIT IT INSIDE THE ESP32.
            const feedDurationSeconds = 5;

            // 1. Disable the button and change text
            if (btn) {
                btn.disabled = true;
                // Save original content to revert later
                const originalContent = '<i class="fas fa-play"></i> Feed Now';

                // Initial content with starting time
                btn.innerHTML = `<i class="fas fa-spinner" style="animation: spinner-spin 1s linear infinite; display: inline-block;"></i> Processing Feed (${feedDurationSeconds.toFixed(1)} seconds)`;

                // Start Countdown Interval
                let timeLeft = feedDurationSeconds;
                const timerInterval = setInterval(() => {
                    timeLeft -= 0.1;
                    if (timeLeft < 0) timeLeft = 0;
                    btn.innerHTML = `<i class="fas fa-spinner" style="animation: spinner-spin 1s linear infinite; display: inline-block;"></i> Processing Feed (${timeLeft.toFixed(1)} seconds)`;
                }, 100);

                // Revert button state after duration
                setTimeout(() => {
                    clearInterval(timerInterval);
                    btn.disabled = false;
                    btn.innerHTML = originalContent;
                }, feedDurationSeconds * 1000);
            }

            showNotification('Manual feeding activated', 'success');
            addNotification('Manual Feed', 'Manual feeding session started', 'info');

            sendControl({ cmd: 'feed', state: 'on', target: 'feeder', uid: currentUser ? currentUser.uid : undefined, ts: Date.now() });
        }

        function manualShower(btn) {

            // 2. Save original content to revert later
            const originalContent = '<i class="fas fa-shower"></i> Shower Now';
            const simulatedDurationMinutes = 10;
            const simulatedDurationSec = 60; // Temporary for testing

            // 3. Initial content with starting time

            if (currentUser) {

                const showerSwitch = document.getElementById('showerSwitch');
                if (showerSwitch && !showerSwitch.checked) {
                    btn.disabled = true;
                    btn.innerHTML = `<i class="fas fa-spinner" style="animation: spinner-spin 1s linear infinite; display: inline-block;"></i> Processing Shower (${simulatedDurationSec.toFixed(1)} seconds)`;

                    showNotification('Water shower activated', 'success');
                    addNotification('Manual Shower', 'Water shower session started', 'info');
                    database.ref(`showerLogs/${currentUser.uid}/${Date.now()}`).set({
                        type: 'manual',
                        timestamp: Date.now(),
                        duration: `${simulatedDurationMinutes} minutes`
                    });

                    database.ref(`controls/${currentUser.uid}/shower`).set({
                        enabled: true,
                        lastUpdated: Date.now()
                    });

                    // This uses the off, since the ESP32's code is reversed for setting the control.
                    sendControl({ cmd: 'valve', state: 'off', target: 'shower', uid: currentUser ? currentUser.uid : undefined, ts: Date.now() });

                    // 4. Start Countdown Interval
                    let timeLeft = simulatedDurationSec;
                    const timerInterval = setInterval(() => {
                        timeLeft -= 0.1; // Decrement by 0.1s
                        // Clamp to 0 to avoid negative numbers display if timeout lags slightly
                        if (timeLeft < 0) timeLeft = 0;

                        btn.innerHTML = `<i class="fas fa-spinner" style="animation: spinner-spin 1s linear infinite; display: inline-block;"></i> Processing Shower (${timeLeft.toFixed(1)} seconds)`;
                    }, 100);

                    // 5. End Timeout
                    setTimeout(() => {
                        clearInterval(timerInterval); // Stop the countdown updates
                        btn.disabled = false;
                        btn.innerHTML = originalContent;
                        database.ref(`controls/${currentUser.uid}/shower`).set({
                            enabled: false,
                            lastUpdated: Date.now()
                        });
                        sendControl({ cmd: 'valve', state: 'on', target: 'shower', uid: currentUser ? currentUser.uid : undefined, ts: Date.now() });
                        addNotification('Manual Shower', 'Water shower session ended', 'info');
                        // }, simulatedDurationMinutes * 60 * 1000);
                    }, simulatedDurationSec * 1000);
                }
            }

        }

        // Pig Management Functions
        document.getElementById('pigForm').addEventListener('submit', async (e) => {
            e.preventDefault();

            const pigData = {
                tagNumber: document.getElementById('pigTag').value,
                breed: document.getElementById('pigBreed').value,
                age: parseInt(document.getElementById('pigAge').value),
                weight: parseFloat(document.getElementById('pigWeight').value),
                length: parseInt(document.getElementById('pigLength').value),
                gender: document.getElementById('pigGender').value,
                status: 'active',
                registrationDate: Date.now(),
                userId: currentUser.uid
            };

            try {
                const duplicateCheck = await firestore.collection('pigs')
                    .where('userId', '==', currentUser.uid)
                    .where('tagNumber', '==', pigData.tagNumber)
                    .get();

                if (!duplicateCheck.empty) {
                    showNotification('A pig with this tag number already exists!', 'error');
                    return;
                }

                await firestore.collection('pigs').add(pigData);
                document.getElementById('pigForm').reset();
                loadPigs();
                showNotification('Pig registered successfully!', 'success');
            } catch (error) {
                showNotification(`Registration failed: ${error.message}`, 'error');
            }
        });

        async function loadPigs() {
            if (!currentUser) return;

            try {
                const snapshot = await firestore.collection('pigs')
                    .where('userId', '==', currentUser.uid)
                    .get();

                const tableBody = document.getElementById('pigTableBody');
                tableBody.innerHTML = '';

                // Update dropdowns for comparison
                const pig1Select = document.getElementById('pig1Select');
                const pig2Select = document.getElementById('pig2Select');

                if (pig1Select && pig2Select) {
                    const currentPig1 = pig1Select.value;
                    const currentPig2 = pig2Select.value;

                    pig1Select.innerHTML = '<option value="">Select First Hog</option>';
                    pig2Select.innerHTML = '<option value="">Select Second Hog</option>';
                }

                let totalPigs = 0;

                snapshot.forEach(doc => {
                    const pig = doc.data();
                    totalPigs++;

                    // Update table
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td><strong>${pig.tagNumber}</strong></td>
                        <td>${pig.breed}</td>
                        <td>${pig.age}</td>
                        <td>${pig.weight}</td>
                        <td>${pig.length}</td>
                        <td>${pig.gender}</td>
                        <td><span class="status-badge status-${pig.status}">${pig.status}</span></td>
                        <td>
                            ${pig.status !== 'sold' ?
                            `<button class="btn-edit" onclick="openEditModal('${doc.id}')">
        <i class="fas fa-edit"></i> Update
    </button>
    <button class="btn-history" onclick="showPigGrowthAnalysis('${doc.id}')">
        <i class="fas fa-chart-line"></i> Growth
    </button>
    <button class="btn-sell" onclick="openSellModal('${doc.id}')">
        <i class="fas fa-peso-sign"></i> Sell
    </button>
    <button class="btn-delete" onclick="openDeleteModal('${doc.id}')">
        <i class="fas fa-trash"></i> Delete
    </button>` :
                            `<div style="display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center;">
        <button class="btn-history" onclick="showPigGrowthAnalysis('${doc.id}')">
            <i class="fas fa-chart-line"></i> Growth
        </button>
        <button class="btn-delete" onclick="openDeleteModal('${doc.id}')">
            <i class="fas fa-trash"></i> Delete
        </button>
    </div>`
                        }
</td>
                    `;
                    tableBody.appendChild(row);

                    // Update dropdowns for all pigs (not just healthy ones)
                    if (pig1Select && pig2Select) {
                        const option1 = document.createElement('option');
                        option1.value = doc.id;
                        option1.textContent = `${pig.tagNumber} - ${pig.breed} (${pig.status})`;
                        pig1Select.appendChild(option1);

                        const option2 = document.createElement('option');
                        option2.value = doc.id;
                        option2.textContent = `${pig.tagNumber} - ${pig.breed} (${pig.status})`;
                        pig2Select.appendChild(option2);
                    }
                });

                document.getElementById('pigCount').textContent = totalPigs;
            } catch (error) {
                showNotification(`Failed to load pigs: ${error.message}`, 'error');
            }
        }

        function openSellModal(pigId) {
            currentPigToSell = pigId;
            document.getElementById('sellPigModal').classList.add('show');
        }

        function closeSellModal() {
            currentPigToSell = null;
            document.getElementById('sellPigModal').classList.remove('show');
            document.getElementById('sellPigForm').reset();
        }

        function openDeleteModal(pigId) {
            currentPigToDelete = pigId;
            document.getElementById('deletePigModal').classList.add('show');
        }

        function closeDeleteModal() {
            currentPigToDelete = null;
            document.getElementById('deletePigModal').classList.remove('show');
        }

        function openEditModal(pigId) {
            currentPigToEdit = pigId;

            firestore.collection('pigs').doc(pigId).get().then(doc => {
                if (doc.exists) {
                    const pig = doc.data();
                    document.getElementById('editPigAge').value = pig.age;
                    document.getElementById('editPigWeight').value = pig.weight;
                    document.getElementById('editPigLength').value = pig.length;
                    document.getElementById('editPigModal').classList.add('show');
                }
            });
        }

        function closeEditModal() {
            currentPigToEdit = null;
            document.getElementById('editPigModal').classList.remove('show');
            document.getElementById('editPigForm').reset();
        }

        function openHistoryModal(pigId) {
            currentPigForHistory = pigId;
            document.getElementById('historyModal').classList.add('show');
            loadEditHistory(pigId);
        }

        function closeHistoryModal() {
            currentPigForHistory = null;
            document.getElementById('historyModal').classList.remove('show');
        }

        async function loadEditHistory(pigId) {
            const historyContent = document.getElementById('historyContent');

            try {
                const historySnapshot = await firestore.collection('pigEditHistory')
                    .where('pigId', '==', pigId)
                    .orderBy('timestamp', 'desc')
                    .get();

                if (historySnapshot.empty) {
                    historyContent.innerHTML = '<p style="text-align: center; color: var(--neutral-gray); padding: 2rem;">No edit history available.</p>';
                    return;
                }

                let historyHTML = '<div style="display: flex; flex-direction: column; gap: 1rem;">';

                historySnapshot.forEach(doc => {
                    const history = doc.data();
                    const date = new Date(history.timestamp).toLocaleString();

                    historyHTML += `
                        <div style="background: var(--light-gray); padding: 1.2rem; border-radius: 12px; border-left: 4px solid var(--primary-pink);">
                            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 0.8rem;">
                                <strong style="color: var(--dark-pink);">Updated on ${date}</strong>
                            </div>
                            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 0.8rem;">
                                ${history.changes.age ? `
                                    <div>
                                        <small style="color: var(--neutral-gray); display: block;">Age</small>
                                        <div><span style="color: var(--error-red);">${history.changes.age.old}</span> → <span style="color: var(--success-green);">${history.changes.age.new}</span> months</div>
                                    </div>
                                ` : ''}
                                ${history.changes.weight ? `
                                    <div>
                                        <small style="color: var(--neutral-gray); display: block;">Weight</small>
                                        <div><span style="color: var(--error-red);">${history.changes.weight.old}</span> → <span style="color: var(--success-green);">${history.changes.weight.new}</span> kg</div>
                                    </div>
                                ` : ''}
                                ${history.changes.length ? `
                                    <div>
                                        <small style="color: var(--neutral-gray); display: block;">Length</small>
                                        <div><span style="color: var(--error-red);">${history.changes.length.old}</span> → <span style="color: var(--success-green);">${history.changes.length.new}</span> cm</div>
                                    </div>
                                ` : ''}
                            </div>
                        </div>
                    `;
                });

                historyHTML += '</div>';
                historyContent.innerHTML = historyHTML;
            } catch (error) {
                historyContent.innerHTML = `<p style="text-align: center; color: var(--error-red); padding: 2rem;">Error loading history: ${error.message}</p>`;
            }
        }

        document.getElementById('editPigForm').addEventListener('submit', async (e) => {
            e.preventDefault();

            if (!currentPigToEdit) return;

            const newAge = parseInt(document.getElementById('editPigAge').value);
            const newWeight = parseFloat(document.getElementById('editPigWeight').value);
            const newLength = parseInt(document.getElementById('editPigLength').value);

            try {
                const pigDoc = await firestore.collection('pigs').doc(currentPigToEdit).get();
                const oldData = pigDoc.data();

                const changes = {};
                if (oldData.age !== newAge) {
                    changes.age = { old: oldData.age, new: newAge };
                }
                if (oldData.weight !== newWeight) {
                    changes.weight = { old: oldData.weight, new: newWeight };
                }
                if (oldData.length !== newLength) {
                    changes.length = { old: oldData.length, new: newLength };
                }

                if (Object.keys(changes).length > 0) {
                    await firestore.collection('pigEditHistory').add({
                        pigId: currentPigToEdit,
                        pigTag: oldData.tagNumber,
                        changes: changes,
                        timestamp: Date.now(),
                        userId: currentUser.uid
                    });

                    await firestore.collection('pigs').doc(currentPigToEdit).update({
                        age: newAge,
                        weight: newWeight,
                        length: newLength,
                        lastModified: Date.now()
                    });

                    closeEditModal();
                    loadPigs();
                    showNotification('Pig information updated successfully!', 'success');
                } else {
                    showNotification('No changes were made.', 'info');
                }
            } catch (error) {
                showNotification(`Update failed: ${error.message}`, 'error');
            }
        });

        function openDeleteModal(pigId) {
            currentPigToDelete = pigId;
            document.getElementById('deletePigModal').classList.add('show');
        }

        function closeDeleteModal() {
            currentPigToDelete = null;
            document.getElementById('deletePigModal').classList.remove('show');
        }

        async function confirmDelete() {
            if (!currentPigToDelete) return;

            try {
                await firestore.collection('pigs').doc(currentPigToDelete).delete();
                closeDeleteModal();
                loadPigs();
                showNotification('Pig deleted successfully', 'success');
            } catch (error) {
                showNotification(`Delete failed: ${error.message}`, 'error');
            }
        }

        document.getElementById('sellPigForm').addEventListener('submit', async (e) => {
            e.preventDefault();

            if (!currentPigToSell) return;

            const saleAmount = parseFloat(document.getElementById('sellAmount').value);
            const buyerName = document.getElementById('buyerName').value;

            try {
                await firestore.collection('pigs').doc(currentPigToSell).update({
                    status: 'sold',
                    saleAmount: saleAmount,
                    buyerName: buyerName || 'N/A',
                    saleDate: Date.now()
                });

                closeSellModal();
                loadPigs();
                showNotification(`Pig sold successfully for ₱${saleAmount.toLocaleString()}`, 'success');
            } catch (error) {
                showNotification(`Sale failed: ${error.message}`, 'error');
            }
        });

        // Charts and Statistics
        function initializeCharts() {
            destroyAllCharts();

            const tempCtx = document.getElementById('temperatureChart');
            const humidityCtx = document.getElementById('humidityChart');
            const bodyTempCtx = document.getElementById('pigTempChart');

            if (!tempCtx || !humidityCtx || !bodyTempCtx) {
                console.log('Chart canvases not found');
                return;
            }

            const chartOptions = {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: 'rgba(0, 0, 0, 0.05)'
                        }
                    },
                    x: {
                        grid: {
                            color: 'rgba(0, 0, 0, 0.05)'
                        }
                    }
                },
                plugins: {
                    legend: {
                        position: 'top',
                        labels: {
                            font: {
                                family: 'Inter',
                                weight: '600'
                            }
                        }
                    }
                }
            };

            chartInstances.temperature = new Chart(tempCtx, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [{
                        label: 'Temperature (°C)',
                        data: [],
                        borderColor: '#E91E63',
                        backgroundColor: 'rgba(233, 30, 99, 0.1)',
                        tension: 0.4,
                        borderWidth: 3,
                        pointRadius: 4,
                        pointBackgroundColor: '#E91E63'
                    }]
                },
                options: chartOptions
            });

            chartInstances.humidity = new Chart(humidityCtx, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [{
                        label: 'Humidity (%)',
                        data: [],
                        borderColor: '#03A9F4',
                        backgroundColor: 'rgba(3, 169, 244, 0.1)',
                        tension: 0.4,
                        borderWidth: 3,
                        pointRadius: 4,
                        pointBackgroundColor: '#03A9F4'
                    }]
                },
                options: chartOptions
            });

            chartInstances.bodyTemp = new Chart(bodyTempCtx, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [{
                        label: 'Pig Body Temperature (°C)',
                        data: [],
                        borderColor: '#FF4081',
                        backgroundColor: 'rgba(255, 64, 129, 0.1)',
                        tension: 0.4,
                        borderWidth: 3,
                        pointRadius: 4,
                        pointBackgroundColor: '#FF4081'
                    }]
                },
                options: chartOptions
            });

            // Load initial data
            updateCharts();
        }

        async function updateCharts() {
            if (!currentUser) return;

            if (!chartInstances.temperature || !chartInstances.humidity || !chartInstances.bodyTemp) {
                console.log('Charts not initialized');
                return;
            }

            const filter = document.getElementById('dataFilter').value;
            const customDate = document.getElementById('customDate').value;

            try {
                let startTime, endTime;
                const now = Date.now();

                // Calculate time range based on filter
                if (customDate) {
                    // If custom date is selected, get data for that entire day
                    const selectedDate = new Date(customDate);
                    startTime = selectedDate.setHours(0, 0, 0, 0);
                    endTime = selectedDate.setHours(23, 59, 59, 999);
                } else {
                    // Use filter dropdown
                    switch (filter) {
                        case '24h':
                            startTime = now - (24 * 60 * 60 * 1000); // 24 hours ago
                            break;
                        case '7d':
                            startTime = now - (7 * 24 * 60 * 60 * 1000); // 7 days ago
                            break;
                        default:
                            startTime = now - (24 * 60 * 60 * 1000);
                    }
                    endTime = now;
                }

                // Fetch sensor data from Firebase
                const sensorRef = database.ref(`sensorData/${currentUser.uid}`);
                const snapshot = await sensorRef
                    .orderByChild('timestamp')
                    .startAt(startTime)
                    .endAt(endTime)
                    .once('value');

                const sensorData = [];
                snapshot.forEach(child => {
                    sensorData.push(child.val());
                });

                // Sort by timestamp
                sensorData.sort((a, b) => a.timestamp - b.timestamp);

                if (sensorData.length === 0) {
                    showNotification('No sensor data available for the selected period', 'info');

                    // Clear charts
                    chartInstances.temperature.data.labels = [];
                    chartInstances.temperature.data.datasets[0].data = [];
                    chartInstances.temperature.update();

                    chartInstances.humidity.data.labels = [];
                    chartInstances.humidity.data.datasets[0].data = [];
                    chartInstances.humidity.update();

                    chartInstances.bodyTemp.data.labels = [];
                    chartInstances.bodyTemp.data.datasets[0].data = [];
                    chartInstances.bodyTemp.update();

                    return;
                }

                // Determine data point limit based on time range
                let maxDataPoints;
                const timeRangeHours = (endTime - startTime) / (60 * 60 * 1000);

                if (timeRangeHours <= 24) {
                    maxDataPoints = 48; // Show more detail for 24h
                } else if (timeRangeHours <= 168) { // 7 days
                    maxDataPoints = 84; // ~12 points per day
                } else {
                    maxDataPoints = 60; // ~2 points per day for 30 days
                }

                // Sample data if too many points
                let sampledData = sensorData;
                if (sensorData.length > maxDataPoints) {
                    const step = Math.floor(sensorData.length / maxDataPoints);
                    sampledData = sensorData.filter((_, index) => index % step === 0);
                }

                // Prepare chart data
                const labels = [];
                const tempData = [];
                const humidityData = [];
                const pigTempData = [];

                sampledData.forEach(data => {
                    const date = new Date(data.timestamp);

                    // Format label based on time range
                    let label;
                    if (timeRangeHours <= 24) {
                        // Show time for 24h view
                        label = date.toLocaleTimeString('en-US', {
                            hour: '2-digit',
                            minute: '2-digit'
                        });
                    } else {
                        // Show date and time for longer ranges
                        label = date.toLocaleString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                        });
                    }

                    labels.push(label);
                    tempData.push(parseFloat(data.temperature) || 0);
                    humidityData.push(parseFloat(data.humidity) || 0);
                    pigTempData.push(parseFloat(data.pigBodyTemp) || 0);
                });

                // Update charts
                chartInstances.temperature.data.labels = labels;
                chartInstances.temperature.data.datasets[0].data = tempData;
                chartInstances.temperature.update();

                chartInstances.humidity.data.labels = labels;
                chartInstances.humidity.data.datasets[0].data = humidityData;
                chartInstances.humidity.update();

                chartInstances.bodyTemp.data.labels = labels;
                chartInstances.bodyTemp.data.datasets[0].data = pigTempData;
                chartInstances.bodyTemp.update();

                showNotification(`Charts updated with ${sampledData.length} data points`, 'success');

            } catch (error) {
                console.error('Error updating charts:', error);
                showNotification(`Failed to update charts: ${error.message}`, 'error');
            }
        }

        // Auto-refresh charts every 30 seconds when on statistics page
        let chartRefreshInterval;

        function startChartAutoRefresh() {
            stopChartAutoRefresh();
            chartRefreshInterval = setInterval(() => {
                const statsPage = document.getElementById('statisticsPage');
                if (statsPage && statsPage.classList.contains('active')) {
                    updateCharts();
                }
            }, 30000); // Refresh every 30 seconds
        }

        function stopChartAutoRefresh() {
            if (chartRefreshInterval) {
                clearInterval(chartRefreshInterval);
                chartRefreshInterval = null;
            }
        }

        // Pig Comparison Function with Print Feature
        async function updateComparison() {
            const pig1Id = document.getElementById('pig1Select').value;
            const pig2Id = document.getElementById('pig2Select').value;

            const comparisonSummary = document.getElementById('comparisonSummary');
            const comparisonChartContainer = document.getElementById('comparisonChartContainer');
            const comparisonChartsGrid = document.getElementById('comparisonChartsGrid');

            if (!pig1Id || !pig2Id) {
                showNotification('Please select two pigs to compare', 'warning');
                comparisonSummary.style.display = 'none';
                comparisonChartsGrid.style.display = 'none';
                comparisonChartContainer.innerHTML = `
            <p style="text-align: center; color: var(--neutral-gray); padding: 3rem;">
                <i class="fas fa-chart-bar" style="font-size: 3rem; margin-bottom: 1rem; display: block; opacity: 0.3;"></i>
                Select two pigs to compare their growth history
            </p>
        `;
                // Hide print button
                const printBtn = document.getElementById('printComparisonBtn');
                if (printBtn) printBtn.style.display = 'none';
                return;
            }

            if (pig1Id === pig2Id) {
                showNotification('Please select two different pigs', 'error');
                return;
            }

            try {
                // Get pig data
                const pig1Doc = await firestore.collection('pigs').doc(pig1Id).get();
                const pig2Doc = await firestore.collection('pigs').doc(pig2Id).get();

                if (!pig1Doc.exists || !pig2Doc.exists) {
                    showNotification('One or both pigs not found', 'error');
                    return;
                }

                const pig1 = pig1Doc.data();
                const pig2 = pig2Doc.data();

                // Get edit history for both pigs
                const pig1History = await firestore.collection('pigEditHistory')
                    .where('pigId', '==', pig1Id)
                    .orderBy('timestamp', 'asc')
                    .get();

                const pig2History = await firestore.collection('pigEditHistory')
                    .where('pigId', '==', pig2Id)
                    .orderBy('timestamp', 'asc')
                    .get();

                // Build history arrays
                const pig1Data = {
                    ages: [pig1.age],
                    weights: [pig1.weight],
                    lengths: [pig1.length],
                    dates: [new Date(pig1.registrationDate).toLocaleDateString()]
                };

                const pig2Data = {
                    ages: [pig2.age],
                    weights: [pig2.weight],
                    lengths: [pig2.length],
                    dates: [new Date(pig2.registrationDate).toLocaleDateString()]
                };

                // Add historical data
                pig1History.forEach(doc => {
                    const history = doc.data();
                    if (history.changes.age) pig1Data.ages.push(history.changes.age.new);
                    if (history.changes.weight) pig1Data.weights.push(history.changes.weight.new);
                    if (history.changes.length) pig1Data.lengths.push(history.changes.length.new);
                    pig1Data.dates.push(new Date(history.timestamp).toLocaleDateString());
                });

                pig2History.forEach(doc => {
                    const history = doc.data();
                    if (history.changes.age) pig2Data.ages.push(history.changes.age.new);
                    if (history.changes.weight) pig2Data.weights.push(history.changes.weight.new);
                    if (history.changes.length) pig2Data.lengths.push(history.changes.length.new);
                    pig2Data.dates.push(new Date(history.timestamp).toLocaleDateString());
                });

                // Display summary
                const summaryContent = document.getElementById('summaryContent');
                summaryContent.innerHTML = `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                <div>
                    <strong style="color: var(--primary-pink); font-size: 1.1rem;">${pig1.tagNumber}</strong>
                    <div style="margin-top: 0.5rem;">
                        <div><strong>Breed:</strong> ${pig1.breed}</div>
                        <div><strong>Current Age:</strong> ${pig1.age} months</div>
                        <div><strong>Current Weight:</strong> ${pig1.weight} kg</div>
                        <div><strong>Current Length:</strong> ${pig1.length} cm</div>
                    </div>
                </div>
                <div>
                    <strong style="color: var(--accent-pink); font-size: 1.1rem;">${pig2.tagNumber}</strong>
                    <div style="margin-top: 0.5rem;">
                        <div><strong>Breed:</strong> ${pig2.breed}</div>
                        <div><strong>Current Age:</strong> ${pig2.age} months</div>
                        <div><strong>Current Weight:</strong> ${pig2.weight} kg</div>
                        <div><strong>Current Length:</strong> ${pig2.length} cm</div>
                    </div>
                </div>
            </div>
            <div style="margin-top: 1rem; padding-top: 1rem; border-top: 2px solid var(--light-pink);">
                <strong style="color: var(--dark-pink);">Swine Health Form – Physical Comparison:</strong>
                <div style="margin-top: 0.5rem;">

                    <!-- Weight Comparison -->
                    ${pig1.weight > pig2.weight ?
                        `<div>• ${pig1.tagNumber} is heavier by ${(pig1.weight - pig2.weight).toFixed(1)} kg</div>` :
                        `<div>• ${pig2.tagNumber} is heavier by ${(pig2.weight - pig1.weight).toFixed(1)} kg</div>`
                    }

                    <!-- Age Comparison -->
                    ${pig1.age > pig2.age ?
                        `<div>• ${pig1.tagNumber} is older by ${pig1.age - pig2.age} months</div>` :
                        pig1.age < pig2.age ?
                            `<div>• ${pig2.tagNumber} is older by ${pig2.age - pig1.age} months</div>` :
                            `<div>• Both pigs are the same age</div>`
                    }

                    <!-- Length Comparison -->
                    ${pig1.length > pig2.length ?
                        `<div>• ${pig1.tagNumber} is longer by ${pig1.length - pig2.length} cm</div>` :
                        `<div>• ${pig2.tagNumber} is longer by ${pig2.length - pig1.length} cm</div>`
                    }

                    <div style="margin-top: 0.5rem;">
                        <strong>Category & Health Status:</strong>

                        <!-- Pig 1 Category + Colored Health -->
                        <div>
                            • ${pig1.tagNumber} is 
                            ${pig1.age <= 2 ? "a Piglet" :
                        pig1.age <= 3 ? "a Weaner" :
                            pig1.age <= 5 ? "a Grower" :
                                pig1.age <= 6 ? "a Finisher" :
                                    "an Adult Breeding Pig"
                    }
                            —
                            ${(() => {
                        const healthy =
                            pig1.age <= 2 ? (pig1.weight >= 3 && pig1.weight <= 12) :
                                pig1.age <= 3 ? (pig1.weight >= 12 && pig1.weight <= 30) :
                                    pig1.age <= 5 ? (pig1.weight >= 25 && pig1.weight <= 70) :
                                        pig1.age <= 6 ? (pig1.weight >= 70 && pig1.weight <= 130) :
                                            (pig1.weight >= 150 && pig1.weight <= 300);

                        return healthy
                            ? `<span style="color: green;">Healthy</span>`
                            : `<span style="color: red;">Underweight/Unhealthy</span>`;
                    })()
                    }
                        </div>

                        <!-- Pig 2 Category + Colored Health -->
                        <div>
                            • ${pig2.tagNumber} is 
                            ${pig2.age <= 2 ? "a Piglet" :
                        pig2.age <= 3 ? "a Weaner" :
                            pig2.age <= 5 ? "a Grower" :
                                pig2.age <= 6 ? "a Finisher" :
                                    "an Adult Breeding Pig"
                    }
                            —
                            ${(() => {
                        const healthy =
                            pig2.age <= 2 ? (pig2.weight >= 3 && pig2.weight <= 12) :
                                pig2.age <= 3 ? (pig2.weight >= 12 && pig2.weight <= 30) :
                                    pig2.age <= 5 ? (pig2.weight >= 25 && pig2.weight <= 70) :
                                        pig2.age <= 6 ? (pig2.weight >= 70 && pig2.weight <= 130) :
                                            (pig2.weight >= 150 && pig2.weight <= 300);

                        return healthy
                            ? `<span style="color: green;">Healthy</span>`
                            : `<span style="color: red;">Underweight/Unhealthy</span>`;
                    })()
                    }
                        </div>

                    </div>

                </div>
            </div>
        `;

                comparisonSummary.style.display = 'block';
                comparisonChartContainer.style.display = 'none';
                comparisonChartsGrid.style.display = 'grid';

                // Show print button
                const printBtn = document.getElementById('printComparisonBtn');
                if (printBtn) printBtn.style.display = 'inline-block';

                // Destroy existing comparison charts
                ['ageComparisonChart', 'weightComparisonChart', 'lengthComparisonChart'].forEach(chartId => {
                    destroyChart(chartId);
                });

                // Create comparison charts
                const chartOptions = {
                    responsive: true,
                    maintainAspectRatio: true,
                    scales: {
                        y: {
                            beginAtZero: true,
                            grid: {
                                color: 'rgba(0, 0, 0, 0.05)'
                            }
                        },
                        x: {
                            grid: {
                                color: 'rgba(0, 0, 0, 0.05)'
                            }
                        }
                    },
                    plugins: {
                        legend: {
                            position: 'top',
                            labels: {
                                font: {
                                    family: 'Inter',
                                    weight: '600'
                                }
                            }
                        }
                    }
                };

                // Age Comparison Chart
                chartInstances.ageComparisonChart = new Chart(document.getElementById('ageComparisonChart'), {
                    type: 'line',
                    data: {
                        labels: pig1Data.dates.length >= pig2Data.dates.length ? pig1Data.dates : pig2Data.dates,
                        datasets: [
                            {
                                label: pig1.tagNumber,
                                data: pig1Data.ages,
                                borderColor: '#E91E63',
                                backgroundColor: 'rgba(233, 30, 99, 0.1)',
                                tension: 0.4,
                                borderWidth: 3
                            },
                            {
                                label: pig2.tagNumber,
                                data: pig2Data.ages,
                                borderColor: '#FF4081',
                                backgroundColor: 'rgba(255, 64, 129, 0.1)',
                                tension: 0.4,
                                borderWidth: 3
                            }
                        ]
                    },
                    options: chartOptions
                });

                // Weight Comparison Chart
                chartInstances.weightComparisonChart = new Chart(document.getElementById('weightComparisonChart'), {
                    type: 'line',
                    data: {
                        labels: pig1Data.dates.length >= pig2Data.dates.length ? pig1Data.dates : pig2Data.dates,
                        datasets: [
                            {
                                label: pig1.tagNumber,
                                data: pig1Data.weights,
                                borderColor: '#2196F3',
                                backgroundColor: 'rgba(33, 150, 243, 0.1)',
                                tension: 0.4,
                                borderWidth: 3
                            },
                            {
                                label: pig2.tagNumber,
                                data: pig2Data.weights,
                                borderColor: '#03A9F4',
                                backgroundColor: 'rgba(3, 169, 244, 0.1)',
                                tension: 0.4,
                                borderWidth: 3
                            }
                        ]
                    },
                    options: chartOptions
                });

                // Length Comparison Chart
                chartInstances.lengthComparisonChart = new Chart(document.getElementById('lengthComparisonChart'), {
                    type: 'line',
                    data: {
                        labels: pig1Data.dates.length >= pig2Data.dates.length ? pig1Data.dates : pig2Data.dates,
                        datasets: [
                            {
                                label: pig1.tagNumber,
                                data: pig1Data.lengths,
                                borderColor: '#9C27B0',
                                backgroundColor: 'rgba(156, 39, 176, 0.1)',
                                tension: 0.4,
                                borderWidth: 3
                            },
                            {
                                label: pig2.tagNumber,
                                data: pig2Data.lengths,
                                borderColor: '#7B1FA2',
                                backgroundColor: 'rgba(123, 31, 162, 0.1)',
                                tension: 0.4,
                                borderWidth: 3
                            }
                        ]
                    },
                    options: chartOptions
                });

                showNotification('Comparison charts generated successfully!', 'success');

            } catch (error) {
                showNotification(`Comparison failed: ${error.message}`, 'error');
                console.error('Comparison error:', error);
            }
        }

        // Print Comparison Function
        function printComparison() {
            const comparisonSummary = document.getElementById('comparisonSummary');
            const comparisonChartsGrid = document.getElementById('comparisonChartsGrid');

            if (!comparisonSummary || comparisonSummary.style.display === 'none') {
                showNotification('Please generate a comparison first', 'warning');
                return;
            }

            // Create print window
            const printWindow = window.open('', '_blank');

            // Get chart images
            const ageChart = document.getElementById('ageComparisonChart');
            const weightChart = document.getElementById('weightComparisonChart');
            const lengthChart = document.getElementById('lengthComparisonChart');

            const ageChartImage = ageChart ? ageChart.toDataURL('image/png') : '';
            const weightChartImage = weightChart ? weightChart.toDataURL('image/png') : '';
            const lengthChartImage = lengthChart ? lengthChart.toDataURL('image/png') : '';

            // Get summary content
            const summaryContent = document.getElementById('summaryContent').innerHTML;

            // Build print content
            printWindow.document.write(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Pig Comparison Report - SwineCare</title>
            <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
            <style>
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }
                
                body {
                    font-family: 'Inter', Arial, sans-serif;
                    padding: 2rem;
                    background: white;
                    color: #424242;
                    line-height: 1.6;
                }
                
                .header {
                    text-align: center;
                    margin-bottom: 2rem;
                    padding-bottom: 1.5rem;
                    border-bottom: 3px solid #E91E63;
                }
                
                .header h1 {
                    color: #E91E63;
                    font-size: 2rem;
                    font-weight: 800;
                    margin-bottom: 0.5rem;
                }
                
                .header p {
                    color: #666;
                    font-size: 0.95rem;
                }
                
                .summary-section {
                    background: linear-gradient(135deg, rgba(233, 30, 99, 0.08), rgba(240, 98, 146, 0.08));
                    padding: 1.5rem;
                    border-radius: 12px;
                    border: 2px solid #FCE4EC;
                    margin-bottom: 2rem;
                }
                
                .summary-section h2 {
                    color: #C2185B;
                    font-size: 1.3rem;
                    margin-bottom: 1rem;
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                }
                
                .comparison-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 1.5rem;
                    margin-bottom: 1rem;
                }
                
                .pig-info {
                    background: white;
                    padding: 1rem;
                    border-radius: 8px;
                }
                
                .pig-info strong:first-child {
                    display: block;
                    margin-bottom: 0.5rem;
                    font-size: 1.1rem;
                }
                
                .pig-info div {
                    margin-bottom: 0.3rem;
                }
                
                .analysis {
                    margin-top: 1rem;
                    padding-top: 1rem;
                    border-top: 2px solid #FCE4EC;
                }
                
                .analysis strong {
                    color: #C2185B;
                    display: block;
                    margin-bottom: 0.5rem;
                }
                
                .analysis > div > div {
                    margin-bottom: 0.4rem;
                    line-height: 1.8;
                }
                
                .charts-section {
                    margin-top: 2rem;
                }
                
                .charts-section h2 {
                    color: #C2185B;
                    font-size: 1.3rem;
                    margin-bottom: 1.5rem;
                    padding-left: 1rem;
                    border-left: 4px solid #E91E63;
                }
                
                .chart-container {
                    margin-bottom: 2rem;
                    page-break-inside: avoid;
                }
                
                .chart-container h3 {
                    color: #C2185B;
                    font-size: 1.1rem;
                    margin-bottom: 1rem;
                    text-align: center;
                }
                
                .chart-container img {
                    width: 100%;
                    max-width: 800px;
                    display: block;
                    margin: 0 auto;
                    border: 1px solid #E8E8E8;
                    border-radius: 8px;
                }
                
                .footer {
                    text-align: center;
                    margin-top: 3rem;
                    padding-top: 1.5rem;
                    border-top: 2px solid #E8E8E8;
                    color: #666;
                    font-size: 0.9rem;
                }
                
                @media print {
                    body {
                        padding: 1rem;
                    }
                    
                    .chart-container {
                        page-break-inside: avoid;
                    }
                }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>🐷 SwineCare Pig Comparison Report</h1>
                <p>Comprehensive Growth Analysis & Health Comparison</p>
                <p style="margin-top: 0.5rem; font-size: 0.85rem;">Generated on: ${new Date().toLocaleString()}</p>
            </div>
            
            <div class="summary-section">
                <h2>📊 Comparison Summary</h2>
                ${summaryContent}
            </div>
            
            <div class="charts-section">
                <h2>📈 Growth Comparison Charts</h2>
                
                ${ageChartImage ? `
                    <div class="chart-container">
                        <h3>Age Comparison Over Time</h3>
                        <img src="${ageChartImage}" alt="Age Comparison Chart">
                    </div>
                ` : ''}
                
                ${weightChartImage ? `
                    <div class="chart-container">
                        <h3>Weight Comparison Over Time</h3>
                        <img src="${weightChartImage}" alt="Weight Comparison Chart">
                    </div>
                ` : ''}
                
                ${lengthChartImage ? `
                    <div class="chart-container">
                        <h3>Length Comparison Over Time</h3>
                        <img src="${lengthChartImage}" alt="Length Comparison Chart">
                    </div>
                ` : ''}
            </div>
            
            <div class="footer">
                <em <strong style="color: #E91E63;">SwineCare</strong> Your Swine Health Monitoring & Management System<br> </em>
            </div>
        </body>
        </html>
    `);

            printWindow.document.close();

            // Wait for images to load before printing
            setTimeout(() => {
                printWindow.print();
            }, 500);

            showNotification('Print dialog opened', 'success');
        }

        // Single Pig Growth Analysis Function with PDF Download
        async function showPigGrowthAnalysis(pigId) {
            if (!pigId) {
                showNotification('Please select a pig to analyze', 'warning');
                return;
            }

            try {
                // Get pig data
                const pigDoc = await firestore.collection('pigs').doc(pigId).get();

                if (!pigDoc.exists) {
                    showNotification('Pig not found', 'error');
                    return;
                }

                const pig = pigDoc.data();

                // Get edit history
                const historySnapshot = await firestore.collection('pigEditHistory')
                    .where('pigId', '==', pigId)
                    .orderBy('timestamp', 'asc')
                    .get();

                // Build historical data arrays
                const dates = [new Date(pig.registrationDate).toLocaleDateString()];
                let weights = [];
                let lengths = [];
                let ages = [];

                // Track changes
                const weightChanges = [];
                const lengthChanges = [];

                // IMPORTANT: Find the initial values from the first edit history
                let initialWeight = pig.weight;
                let initialLength = pig.length;
                let initialAge = pig.age;

                if (!historySnapshot.empty) {
                    const firstEdit = historySnapshot.docs[0].data();
                    if (firstEdit.changes.weight) {
                        initialWeight = firstEdit.changes.weight.old;
                    }
                    if (firstEdit.changes.length) {
                        initialLength = firstEdit.changes.length.old;
                    }
                    if (firstEdit.changes.age) {
                        initialAge = firstEdit.changes.age.old;
                    }
                }

                // Start with initial values
                weights.push(initialWeight);
                lengths.push(initialLength);
                ages.push(initialAge);

                historySnapshot.forEach(doc => {
                    const history = doc.data();
                    const date = new Date(history.timestamp).toLocaleDateString();
                    dates.push(date);

                    if (history.changes.weight) {
                        weights.push(history.changes.weight.new);
                        weightChanges.push({
                            date: date,
                            old: history.changes.weight.old,
                            new: history.changes.weight.new,
                            change: (history.changes.weight.new - history.changes.weight.old).toFixed(1)
                        });
                    } else {
                        weights.push(weights[weights.length - 1]);
                    }

                    if (history.changes.length) {
                        lengths.push(history.changes.length.new);
                        lengthChanges.push({
                            date: date,
                            old: history.changes.length.old,
                            new: history.changes.length.new,
                            change: (history.changes.length.new - history.changes.length.old)
                        });
                    } else {
                        lengths.push(lengths[lengths.length - 1]);
                    }

                    if (history.changes.age) {
                        ages.push(history.changes.age.new);
                    } else {
                        ages.push(ages[ages.length - 1]);
                    }
                });

                // Calculate statistics
                const currentWeight = weights[weights.length - 1];
                const currentLength = lengths[lengths.length - 1];
                const totalWeightGain = currentWeight - initialWeight;
                const totalLengthGain = currentLength - initialLength;

                const avgWeightPerUpdate = weightChanges.length > 0
                    ? (weightChanges.reduce((sum, c) => sum + parseFloat(c.change), 0) / weightChanges.length).toFixed(2)
                    : 0;
                const avgLengthPerUpdate = lengthChanges.length > 0
                    ? (lengthChanges.reduce((sum, c) => sum + parseFloat(c.change), 0) / lengthChanges.length).toFixed(1)
                    : 0;

                // Create modal content
                const modalContent = `
            <div style="font-family: 'Inter', sans-serif;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
                    <div style="text-align: center; flex: 1; padding: 1.5rem; background: linear-gradient(135deg, rgba(233, 30, 99, 0.1), rgba(240, 98, 146, 0.1)); border-radius: 12px;">
                        <h2 style="color: var(--primary-pink); margin-bottom: 0.5rem; font-size: 1.8rem;">Growth Analysis</h2>
                        <h3 style="color: var(--dark-pink); font-size: 1.3rem;">${pig.tagNumber} - ${pig.breed}</h3>
                    </div>
                    <button onclick="downloadGrowthAnalysisPDF('${pigId}')" class="btn btn-primary" style="margin-left: 1rem; min-width: 150px;">
                        <i class="fas fa-file-pdf"></i> Download PDF
                    </button>
                </div>
                
                <!-- Initial vs Current Comparison -->
                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem; margin-bottom: 1.5rem;">
                    <div style="background: rgba(158, 158, 158, 0.08); padding: 1rem; border-radius: 12px; border: 2px dashed #9E9E9E;">
                        <div style="font-size: 0.75rem; color: #666; text-transform: uppercase; font-weight: 700; margin-bottom: 0.5rem; text-align: center;">Initial Values (Registration)</div>
                        <div style="display: flex; justify-content: space-around; text-align: center;">
                            <div>
                                <div style="font-size: 0.7rem; color: #999;">Weight</div>
                                <div style="font-size: 1.3rem; font-weight: 700; color: #666;">${initialWeight} kg</div>
                            </div>
                            <div>
                                <div style="font-size: 0.7rem; color: #999;">Length</div>
                                <div style="font-size: 1.3rem; font-weight: 700; color: #666;">${initialLength} cm</div>
                            </div>
                        </div>
                    </div>
                    <div style="background: rgba(76, 175, 80, 0.08); padding: 1rem; border-radius: 12px; border: 2px solid #4CAF50;">
                        <div style="font-size: 0.75rem; color: #666; text-transform: uppercase; font-weight: 700; margin-bottom: 0.5rem; text-align: center;">Current Values</div>
                        <div style="display: flex; justify-content: space-around; text-align: center;">
                            <div>
                                <div style="font-size: 0.7rem; color: #999;">Weight</div>
                                <div style="font-size: 1.3rem; font-weight: 700; color: #4CAF50;">${currentWeight} kg</div>
                            </div>
                            <div>
                                <div style="font-size: 0.7rem; color: #999;">Length</div>
                                <div style="font-size: 1.3rem; font-weight: 700; color: #4CAF50;">${currentLength} cm</div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Summary Statistics -->
                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem; margin-bottom: 2rem;">
                    <div style="background: rgba(33, 150, 243, 0.08); padding: 1.2rem; border-radius: 12px; border-left: 4px solid #2196F3;">
                        <div style="font-size: 0.8rem; color: #666; text-transform: uppercase; font-weight: 700; margin-bottom: 0.3rem;">Total Weight Gain</div>
                        <div style="font-size: 1.8rem; font-weight: 800; color: ${totalWeightGain >= 0 ? '#2196F3' : '#F44336'};">
                            ${totalWeightGain >= 0 ? '+' : ''}${totalWeightGain.toFixed(1)} <span style="font-size: 1rem;">kg</span>
                        </div>
                        <div style="font-size: 0.75rem; color: #666; margin-top: 0.3rem;">
                            Avg per update: ${avgWeightPerUpdate} kg
                            ${weightChanges.length > 0 ? `<br>Total updates: ${weightChanges.length}` : ''}
                        </div>
                    </div>
                    <div style="background: rgba(156, 39, 176, 0.08); padding: 1.2rem; border-radius: 12px; border-left: 4px solid #9C27B0;">
                        <div style="font-size: 0.8rem; color: #666; text-transform: uppercase; font-weight: 700; margin-bottom: 0.3rem;">Total Length Gain</div>
                        <div style="font-size: 1.8rem; font-weight: 800; color: ${totalLengthGain >= 0 ? '#9C27B0' : '#F44336'};">
                            ${totalLengthGain >= 0 ? '+' : ''}${totalLengthGain} <span style="font-size: 1rem;">cm</span>
                        </div>
                        <div style="font-size: 0.75rem; color: #666; margin-top: 0.3rem;">
                            Avg per update: ${avgLengthPerUpdate} cm
                            ${lengthChanges.length > 0 ? `<br>Total updates: ${lengthChanges.length}` : ''}
                        </div>
                    </div>
                </div>
                
                <!-- Growth Charts -->
                <div style="margin-bottom: 2rem;">
                    <h4 style="color: var(--dark-pink); margin-bottom: 1rem; text-align: center;">Weight & Length Growth Over Time</h4>
                    <canvas id="singlePigGrowthChart" style="max-height: 350px;"></canvas>
                </div>
                
                <!-- Change Details -->
                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem;">
                    <!-- Weight Changes -->
                    <div>
                        <h4 style="color: #2196F3; margin-bottom: 1rem; font-size: 1.1rem;">
                            <i class="fas fa-weight"></i> Weight Changes (${weightChanges.length} updates)
                        </h4>
                        <div style="max-height: 300px; overflow-y: auto;">
                            ${weightChanges.length > 0 ? weightChanges.map(change => `
                                <div style="background: ${parseFloat(change.change) > 0 ? 'rgba(76, 175, 80, 0.08)' : 'rgba(244, 67, 54, 0.08)'}; 
                                            padding: 0.8rem; border-radius: 8px; margin-bottom: 0.5rem; 
                                            border-left: 3px solid ${parseFloat(change.change) > 0 ? '#4CAF50' : '#F44336'};">
                                    <div style="font-size: 0.75rem; color: #666; margin-bottom: 0.3rem;">${change.date}</div>
                                    <div style="display: flex; justify-content: space-between; align-items: center;">
                                        <div>
                                            <span style="color: #999;">${change.old} kg</span>
                                            <i class="fas fa-arrow-right" style="margin: 0 0.5rem; color: #666;"></i>
                                            <span style="font-weight: 700; color: #2196F3;">${change.new} kg</span>
                                        </div>
                                        <div style="font-weight: 700; color: ${parseFloat(change.change) > 0 ? '#4CAF50' : '#F44336'};">
                                            ${parseFloat(change.change) > 0 ? '+' : ''}${change.change} kg
                                        </div>
                                    </div>
                                </div>
                            `).join('') : '<div style="text-align: center; color: #999; padding: 2rem;">No weight changes recorded</div>'}
                        </div>
                    </div>
                    
                    <!-- Length Changes -->
                    <div>
                        <h4 style="color: #9C27B0; margin-bottom: 1rem; font-size: 1.1rem;">
                            <i class="fas fa-ruler-horizontal"></i> Length Changes (${lengthChanges.length} updates)
                        </h4>
                        <div style="max-height: 300px; overflow-y: auto;">
                            ${lengthChanges.length > 0 ? lengthChanges.map(change => `
                                <div style="background: ${parseFloat(change.change) > 0 ? 'rgba(76, 175, 80, 0.08)' : 'rgba(244, 67, 54, 0.08)'}; 
                                            padding: 0.8rem; border-radius: 8px; margin-bottom: 0.5rem; 
                                            border-left: 3px solid ${parseFloat(change.change) > 0 ? '#4CAF50' : '#F44336'};">
                                    <div style="font-size: 0.75rem; color: #666; margin-bottom: 0.3rem;">${change.date}</div>
                                    <div style="display: flex; justify-content: space-between; align-items: center;">
                                        <div>
                                            <span style="color: #999;">${change.old} cm</span>
                                            <i class="fas fa-arrow-right" style="margin: 0 0.5rem; color: #666;"></i>
                                            <span style="font-weight: 700; color: #9C27B0;">${change.new} cm</span>
                                        </div>
                                        <div style="font-weight: 700; color: ${parseFloat(change.change) > 0 ? '#4CAF50' : '#F44336'};">
                                            ${parseFloat(change.change) > 0 ? '+' : ''}${change.change} cm
                                        </div>
                                    </div>
                                </div>
                            `).join('') : '<div style="text-align: center; color: #999; padding: 2rem;">No length changes recorded</div>'}
                        </div>
                    </div>
                </div>
            </div>
        `;

                // Show in modal
                const modal = document.getElementById('historyModal');
                const historyContent = document.getElementById('historyContent');
                historyContent.innerHTML = modalContent;
                modal.classList.add('show');

                // Create combined growth chart
                setTimeout(() => {
                    const ctx = document.getElementById('singlePigGrowthChart');
                    if (ctx) {
                        destroyChart('singlePigGrowthChart');

                        chartInstances.singlePigGrowthChart = new Chart(ctx, {
                            type: 'line',
                            data: {
                                labels: dates,
                                datasets: [
                                    {
                                        label: 'Weight (kg)',
                                        data: weights,
                                        borderColor: '#2196F3',
                                        backgroundColor: 'rgba(33, 150, 243, 0.1)',
                                        tension: 0.4,
                                        borderWidth: 3,
                                        yAxisID: 'y',
                                        pointRadius: 5,
                                        pointHoverRadius: 7
                                    },
                                    {
                                        label: 'Length (cm)',
                                        data: lengths,
                                        borderColor: '#9C27B0',
                                        backgroundColor: 'rgba(156, 39, 176, 0.1)',
                                        tension: 0.4,
                                        borderWidth: 3,
                                        yAxisID: 'y1',
                                        pointRadius: 5,
                                        pointHoverRadius: 7
                                    }
                                ]
                            },
                            options: {
                                responsive: true,
                                maintainAspectRatio: true,
                                interaction: {
                                    mode: 'index',
                                    intersect: false,
                                },
                                scales: {
                                    y: {
                                        type: 'linear',
                                        display: true,
                                        position: 'left',
                                        title: {
                                            display: true,
                                            text: 'Weight (kg)',
                                            color: '#2196F3',
                                            font: {
                                                weight: 'bold'
                                            }
                                        },
                                        grid: {
                                            color: 'rgba(0, 0, 0, 0.05)'
                                        }
                                    },
                                    y1: {
                                        type: 'linear',
                                        display: true,
                                        position: 'right',
                                        title: {
                                            display: true,
                                            text: 'Length (cm)',
                                            color: '#9C27B0',
                                            font: {
                                                weight: 'bold'
                                            }
                                        },
                                        grid: {
                                            drawOnChartArea: false,
                                        }
                                    },
                                    x: {
                                        grid: {
                                            color: 'rgba(0, 0, 0, 0.05)'
                                        }
                                    }
                                },
                                plugins: {
                                    legend: {
                                        position: 'top',
                                        labels: {
                                            font: {
                                                family: 'Inter',
                                                weight: '600'
                                            }
                                        }
                                    },
                                    tooltip: {
                                        callbacks: {
                                            label: function (context) {
                                                let label = context.dataset.label || '';
                                                if (label) {
                                                    label += ': ';
                                                }
                                                if (context.parsed.y !== null) {
                                                    label += context.parsed.y;
                                                    label += context.datasetIndex === 0 ? ' kg' : ' cm';
                                                }
                                                return label;
                                            }
                                        }
                                    }
                                }
                            }
                        });
                    }
                }, 100);

            } catch (error) {
                showNotification(`Growth analysis failed: ${error.message}`, 'error');
                console.error('Growth analysis error:', error);
            }
        }

        // Download Growth Analysis PDF Function
        async function downloadGrowthAnalysisPDF(pigId) {
            try {
                showNotification('Generating PDF, please wait...', 'info');

                // Get pig data
                const pigDoc = await firestore.collection('pigs').doc(pigId).get();
                if (!pigDoc.exists) {
                    showNotification('Pig not found', 'error');
                    return;
                }

                const pig = pigDoc.data();

                // Get edit history
                const historySnapshot = await firestore.collection('pigEditHistory')
                    .where('pigId', '==', pigId)
                    .orderBy('timestamp', 'asc')
                    .get();

                // Build historical data
                const dates = [new Date(pig.registrationDate).toLocaleDateString()];
                let weights = [];
                let lengths = [];
                const weightChanges = [];
                const lengthChanges = [];

                let initialWeight = pig.weight;
                let initialLength = pig.length;

                if (!historySnapshot.empty) {
                    const firstEdit = historySnapshot.docs[0].data();
                    if (firstEdit.changes.weight) initialWeight = firstEdit.changes.weight.old;
                    if (firstEdit.changes.length) initialLength = firstEdit.changes.length.old;
                }

                weights.push(initialWeight);
                lengths.push(initialLength);

                historySnapshot.forEach(doc => {
                    const history = doc.data();
                    const date = new Date(history.timestamp).toLocaleDateString();
                    dates.push(date);

                    if (history.changes.weight) {
                        weights.push(history.changes.weight.new);
                        weightChanges.push({
                            date: date,
                            old: history.changes.weight.old,
                            new: history.changes.weight.new,
                            change: (history.changes.weight.new - history.changes.weight.old).toFixed(1)
                        });
                    } else {
                        weights.push(weights[weights.length - 1]);
                    }

                    if (history.changes.length) {
                        lengths.push(history.changes.length.new);
                        lengthChanges.push({
                            date: date,
                            old: history.changes.length.old,
                            new: history.changes.length.new,
                            change: (history.changes.length.new - history.changes.length.old)
                        });
                    } else {
                        lengths.push(lengths[lengths.length - 1]);
                    }
                });

                const currentWeight = weights[weights.length - 1];
                const currentLength = lengths[lengths.length - 1];
                const totalWeightGain = currentWeight - initialWeight;
                const totalLengthGain = currentLength - initialLength;

                const avgWeightPerUpdate = weightChanges.length > 0
                    ? (weightChanges.reduce((sum, c) => sum + parseFloat(c.change), 0) / weightChanges.length).toFixed(2)
                    : 0;
                const avgLengthPerUpdate = lengthChanges.length > 0
                    ? (lengthChanges.reduce((sum, c) => sum + parseFloat(c.change), 0) / lengthChanges.length).toFixed(1)
                    : 0;

                // Get chart image
                const chartCanvas = document.getElementById('singlePigGrowthChart');
                const chartImage = chartCanvas ? chartCanvas.toDataURL('image/png') : '';

                // Create PDF content
                const pdfContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
                <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet">
                <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body { font-family: 'Inter', Arial, sans-serif; padding: 2rem; background: white; color: #424242; line-height: 1.6; }
                    .header { text-align: center; margin-bottom: 2rem; padding-bottom: 1.5rem; border-bottom: 3px solid #E91E63; }
                    .header h1 { color: #E91E63; font-size: 2rem; font-weight: 800; margin-bottom: 0.5rem; }
                    .header h2 { color: #C2185B; font-size: 1.5rem; margin-bottom: 0.3rem; }
                    .header p { color: #666; font-size: 0.95rem; }
                    .section { margin-bottom: 2rem; }
                    .section h3 { color: #C2185B; font-size: 1.3rem; margin-bottom: 1rem; padding-left: 1rem; border-left: 4px solid #E91E63; }
                    .stats-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem; margin-bottom: 1.5rem; }
                    .stat-card { background: #F5F5F5; padding: 1.2rem; border-radius: 12px; border-left: 4px solid; }
                    .stat-card.initial { border-left-color: #9E9E9E; }
                    .stat-card.current { border-left-color: #4CAF50; }
                    .stat-card.weight { border-left-color: #2196F3; }
                    .stat-card.length { border-left-color: #9C27B0; }
                    .stat-label { font-size: 0.8rem; color: #666; text-transform: uppercase; font-weight: 700; margin-bottom: 0.3rem; }
                    .stat-value { font-size: 1.5rem; font-weight: 800; }
                    .chart-container { margin: 2rem 0; text-align: center; page-break-inside: avoid; }
                    .chart-container img { max-width: 100%; border: 1px solid #E8E8E8; border-radius: 8px; }
                    .changes-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 1.5rem; }
                    .change-item { background: #F5F5F5; padding: 0.8rem; border-radius: 8px; margin-bottom: 0.5rem; border-left: 3px solid; }
                    .change-item.positive { border-left-color: #4CAF50; background: rgba(76, 175, 80, 0.08); }
                    .change-item.negative { border-left-color: #F44336; background: rgba(244, 67, 54, 0.08); }
                    .footer { text-align: center; margin-top: 3rem; padding-top: 1.5rem; border-top: 2px solid #E8E8E8; color: #666; font-size: 0.9rem; }
                    @media print { body { padding: 1rem; } .section { page-break-inside: avoid; } }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>🐷 SwineCare Growth Analysis Report</h1>
                    <h2>${pig.tagNumber} - ${pig.breed}</h2>
                    <p>Gender: ${pig.gender} | Current Age: ${pig.age} months</p>
                    <p style="margin-top: 0.5rem; font-size: 0.85rem;">Generated on: ${new Date().toLocaleString()}</p>
                </div>

                <div class="section">
                    <h3>📊 Current Status</h3>
                    <div class="stats-grid">
                        <div class="stat-card initial">
                            <div class="stat-label">Initial Weight (Registration)</div>
                            <div class="stat-value" style="color: #666;">${initialWeight} kg</div>
                        </div>
                        <div class="stat-card current">
                            <div class="stat-label">Current Weight</div>
                            <div class="stat-value" style="color: #4CAF50;">${currentWeight} kg</div>
                        </div>
                        <div class="stat-card initial">
                            <div class="stat-label">Initial Length (Registration)</div>
                            <div class="stat-value" style="color: #666;">${initialLength} cm</div>
                        </div>
                        <div class="stat-card current">
                            <div class="stat-label">Current Length</div>
                            <div class="stat-value" style="color: #4CAF50;">${currentLength} cm</div>
                        </div>
                    </div>
                </div>

                <div class="section">
                    <h3>📈 Growth Summary</h3>
                    <div class="stats-grid">
                        <div class="stat-card weight">
                            <div class="stat-label">Total Weight Gain</div>
                            <div class="stat-value" style="color: ${totalWeightGain >= 0 ? '#2196F3' : '#F44336'};">
                                ${totalWeightGain >= 0 ? '+' : ''}${totalWeightGain.toFixed(1)} kg
                            </div>
                            <div style="font-size: 0.75rem; color: #666; margin-top: 0.5rem;">
                                Avg per update: ${avgWeightPerUpdate} kg<br>
                                Total updates: ${weightChanges.length}
                            </div>
                        </div>
                        <div class="stat-card length">
                            <div class="stat-label">Total Length Gain</div>
                            <div class="stat-value" style="color: ${totalLengthGain >= 0 ? '#9C27B0' : '#F44336'};">
                                ${totalLengthGain >= 0 ? '+' : ''}${totalLengthGain} cm
                            </div>
                            <div style="font-size: 0.75rem; color: #666; margin-top: 0.5rem;">
                                Avg per update: ${avgLengthPerUpdate} cm<br>
                                Total updates: ${lengthChanges.length}
                            </div>
                        </div>
                    </div>
                </div>

                ${chartImage ? `
                    <div class="section">
                        <h3>📉 Growth Chart</h3>
                        <div class="chart-container">
                            <img src="${chartImage}" alt="Growth Chart">
                        </div>
                    </div>
                ` : ''}

                <div class="section">
                    <h3>📝 Detailed Change History</h3>
                    <div class="changes-grid">
                        <div>
                            <h4 style="color: #2196F3; margin-bottom: 1rem; font-size: 1.1rem;">
                                <i class="fas fa-weight"></i> Weight Changes (${weightChanges.length})
                            </h4>
                            ${weightChanges.length > 0 ? weightChanges.map(change => `
                                <div class="change-item ${parseFloat(change.change) > 0 ? 'positive' : 'negative'}">
                                    <div style="font-size: 0.75rem; color: #666; margin-bottom: 0.3rem;">${change.date}</div>
                                    <div style="display: flex; justify-content: space-between;">
                                        <span>${change.old} kg → ${change.new} kg</span>
                                        <strong style="color: ${parseFloat(change.change) > 0 ? '#4CAF50' : '#F44336'};">
                                            ${parseFloat(change.change) > 0 ? '+' : ''}${change.change} kg
                                        </strong>
                                    </div>
                                </div>
                            `).join('') : '<p style="text-align: center; color: #999;">No weight changes recorded</p>'}
                        </div>
                        <div>
                            <h4 style="color: #9C27B0; margin-bottom: 1rem; font-size: 1.1rem;">
                                <i class="fas fa-ruler-horizontal"></i> Length Changes (${lengthChanges.length})
                            </h4>
                            ${lengthChanges.length > 0 ? lengthChanges.map(change => `
                                <div class="change-item ${parseFloat(change.change) > 0 ? 'positive' : 'negative'}">
                                    <div style="font-size: 0.75rem; color: #666; margin-bottom: 0.3rem;">${change.date}</div>
                                    <div style="display: flex; justify-content: space-between;">
                                        <span>${change.old} cm → ${change.new} cm</span>
                                        <strong style="color: ${parseFloat(change.change) > 0 ? '#4CAF50' : '#F44336'};">
                                            ${parseFloat(change.change) > 0 ? '+' : ''}${change.change} cm
                                        </strong>
                                    </div>
                                </div>
                            `).join('') : '<p style="text-align: center; color: #999;">No length changes recorded</p>'}
                        </div>
                    </div>
                </div>

                <div class="footer">
                    <strong style="color: #E91E63;">SwineCare</strong> - Your Swine Health Monitoring & Management System<br>
                    <em>Growth Analysis Report</em>
                </div>
            </body>
            </html>
        `;

                // Create temporary container for PDF generation
                const tempContainer = document.createElement('div');
                tempContainer.innerHTML = pdfContent;
                tempContainer.style.position = 'absolute';
                tempContainer.style.left = '-9999px';
                tempContainer.style.top = '0';
                tempContainer.style.width = '210mm';
                document.body.appendChild(tempContainer);

                // Generate PDF
                const { jsPDF } = window.jspdf;
                const pdf = new jsPDF('p', 'mm', 'a4');

                const canvas = await html2canvas(tempContainer, {
                    scale: 2,
                    useCORS: true,
                    backgroundColor: '#ffffff',
                    logging: false
                });

                const imgData = canvas.toDataURL('image/png');
                const imgWidth = 210;
                const pageHeight = 295;
                const imgHeight = (canvas.height * imgWidth) / canvas.width;
                let heightLeft = imgHeight;

                let position = 0;

                pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
                heightLeft -= pageHeight;

                while (heightLeft >= 0) {
                    position = heightLeft - imgHeight;
                    pdf.addPage();
                    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
                    heightLeft -= pageHeight;
                }

                // Clean up
                document.body.removeChild(tempContainer);

                // Save PDF
                const filename = `SwineCare_Growth_Analysis_${pig.tagNumber}_${new Date().toLocaleDateString().replace(/\//g, '-')}.pdf`;
                pdf.save(filename);

                showNotification('Growth analysis PDF downloaded successfully!', 'success');

            } catch (error) {
                showNotification(`PDF download failed: ${error.message}`, 'error');
                console.error('PDF download error:', error);
            }
        }

        // Notifications
        function addNotification(title, message, type, showToast = false) {
            const notificationsList = document.getElementById('notificationsList');

            const iconMap = {
                'error': 'fa-exclamation-circle',
                'warning': 'fa-exclamation-triangle',
                'success': 'fa-check-circle',
                'info': 'fa-info-circle'
            };

            const severityMap = {
                'error': 'Critical',
                'warning': 'Warning',
                'success': 'Normal',
                'info': 'Info'
            };

            const notificationEl = document.createElement('div');
            notificationEl.className = `alert alert-${type}`;
            notificationEl.style.animation = 'slideInRight 0.4s ease';
            notificationEl.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: start;">
            <div style="flex: 1;">
                <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.5rem;">
                    <i class="fas ${iconMap[type] || 'fa-bell'}" style="font-size: 1.3rem;"></i>
                    <div style="flex: 1;">
                        <strong style="font-size: 1.05rem;">${title}</strong>
                        <span style="margin-left: 0.5rem; padding: 0.2rem 0.5rem; background: rgba(255,255,255,0.3); border-radius: 4px; font-size: 0.7rem; font-weight: 700;">${severityMap[type]}</span>
                    </div>
                </div>
                <div style="margin-left: 2.05rem; line-height: 1.5;">${message}</div>
                <small style="opacity: 0.7; margin-left: 2.05rem; display: block; margin-top: 0.5rem;">
                    <i class="fas fa-clock" style="margin-right: 0.3rem;"></i>${new Date().toLocaleString()}
                </small>
            </div>
            <button onclick="this.parentElement.parentElement.remove()" 
                    style="background: none; border: none; cursor: pointer; padding: 0.5rem; margin-left: 1rem; opacity: 0.6; transition: opacity 0.2s;">
                <i class="fas fa-times" style="font-size: 1.2rem;"></i>
            </button>
        </div>
    `;

            notificationsList.insertBefore(notificationEl, notificationsList.firstChild);

            // Store in Firebase
            if (currentUser) {
                firestore.collection('notifications').add({
                    title: title,
                    message: message,
                    type: type,
                    severity: severityMap[type],
                    timestamp: Date.now(),
                    userId: currentUser.uid,
                    read: false
                }).catch(error => {
                    console.error('Error saving notification:', error);
                });
            }

            // Only show toast notification if explicitly requested (for user actions, not sensor alerts)
            if (showToast) {
                showNotification(`${title}: ${message}`, type);
            }

            // Auto-remove old notifications (keep only last 50)
            const notifications = notificationsList.children;
            if (notifications.length > 50) {
                for (let i = 50; i < notifications.length; i++) {
                    notifications[i].remove();
                }
            }
        }

        function showNotification(message, type) {
            const toast = document.getElementById('notificationToast');
            const messageEl = document.getElementById('notificationMessage');

            if (!message) return;

            // Clear any existing timeouts
            if (window.notificationTimeout) {
                clearTimeout(window.notificationTimeout);
            }
            if (window.notificationFadeTimeout) {
                clearTimeout(window.notificationFadeTimeout);
            }

            // Remove any existing classes
            toast.classList.remove('show', 'fade-out');

            // Force reflow to restart animation
            void toast.offsetWidth;

            // Set message and show with fade-in
            messageEl.textContent = message;
            toast.classList.add('show');

            // Start fade-out after 2.7 seconds (300ms before full removal)
            window.notificationFadeTimeout = setTimeout(() => {
                toast.classList.add('fade-out');
                toast.classList.remove('show');
            }, 2700);

            // Completely hide after fade-out completes
            window.notificationTimeout = setTimeout(() => {
                toast.classList.remove('fade-out');
            }, 3300); // 2700ms + 600ms fade duration
        }

        // Global variable to store active filters
        let activeReportFilters = {
            breed: '',
            age: null,
            ageComparator: 'exact',
            weight: null,
            weightComparator: 'exact',
            length: null,
            lengthComparator: 'exact',
            gender: ''
        };

        // Open Report Filters Modal
        function openReportFilters() {
            const modal = document.getElementById('reportFilterModal');
            modal.classList.add('show');

            // Populate with current filters
            document.getElementById('filterBreed').value = activeReportFilters.breed;
            document.getElementById('filterAge').value = activeReportFilters.age || '';
            document.getElementById('filterAgeComparator').value = activeReportFilters.ageComparator;
            document.getElementById('filterWeight').value = activeReportFilters.weight || '';
            document.getElementById('filterWeightComparator').value = activeReportFilters.weightComparator;
            document.getElementById('filterLength').value = activeReportFilters.length || '';
            document.getElementById('filterLengthComparator').value = activeReportFilters.lengthComparator;
            document.getElementById('filterGender').value = activeReportFilters.gender;
        }

        // Close Report Filters Modal
        function closeReportFilters() {
            const modal = document.getElementById('reportFilterModal');
            modal.classList.remove('show');
        }

        // Apply Report Filters
        function applyReportFilters() {
            activeReportFilters = {
                breed: document.getElementById('filterBreed').value,
                age: document.getElementById('filterAge').value ? parseInt(document.getElementById('filterAge').value) : null,
                ageComparator: document.getElementById('filterAgeComparator').value,
                weight: document.getElementById('filterWeight').value ? parseFloat(document.getElementById('filterWeight').value) : null,
                weightComparator: document.getElementById('filterWeightComparator').value,
                length: document.getElementById('filterLength').value ? parseInt(document.getElementById('filterLength').value) : null,
                lengthComparator: document.getElementById('filterLengthComparator').value,
                gender: document.getElementById('filterGender').value
            };

            updateActiveFiltersDisplay();
            closeReportFilters();
            showNotification('Filters applied successfully', 'success');
        }

        // Clear Report Filters
        function clearReportFilters() {
            activeReportFilters = {
                breed: '',
                age: null,
                ageComparator: 'exact',
                weight: null,
                weightComparator: 'exact',
                length: null,
                lengthComparator: 'exact',
                gender: ''
            };

            updateActiveFiltersDisplay();
            showNotification('All filters cleared', 'info');
        }

        // Update Active Filters Display
        function updateActiveFiltersDisplay() {
            const displayContainer = document.getElementById('activeFiltersDisplay');
            const filtersList = document.getElementById('activeFiltersList');

            const filters = [];

            if (activeReportFilters.breed) {
                filters.push(`<span style="background: var(--primary-pink); color: white; padding: 0.4rem 0.8rem; border-radius: 20px; font-size: 0.85rem;">
            <i class="fas fa-dna"></i> Breed: ${activeReportFilters.breed}
        </span>`);
            }

            if (activeReportFilters.age !== null) {
                const ageText = activeReportFilters.ageComparator === 'exact' ? `Exactly ${activeReportFilters.age}` :
                    activeReportFilters.ageComparator === 'below' ? `Below ${activeReportFilters.age}` :
                        `Above ${activeReportFilters.age}`;
                filters.push(`<span style="background: var(--accent-pink); color: white; padding: 0.4rem 0.8rem; border-radius: 20px; font-size: 0.85rem;">
            <i class="fas fa-calendar-alt"></i> Age: ${ageText} months
        </span>`);
            }

            if (activeReportFilters.weight !== null) {
                const weightText = activeReportFilters.weightComparator === 'exact' ? `Exactly ${activeReportFilters.weight}` :
                    activeReportFilters.weightComparator === 'below' ? `≤ ${activeReportFilters.weight}` :
                        `≥ ${activeReportFilters.weight}`;
                filters.push(`<span style="background: #2196F3; color: white; padding: 0.4rem 0.8rem; border-radius: 20px; font-size: 0.85rem;">
            <i class="fas fa-weight"></i> Weight: ${weightText} kg
        </span>`);
            }

            if (activeReportFilters.length !== null) {
                const lengthText = activeReportFilters.lengthComparator === 'exact' ? `Exactly ${activeReportFilters.length}` :
                    activeReportFilters.lengthComparator === 'below' ? `≤ ${activeReportFilters.length}` :
                        `≥ ${activeReportFilters.length}`;
                filters.push(`<span style="background: #9C27B0; color: white; padding: 0.4rem 0.8rem; border-radius: 20px; font-size: 0.85rem;">
            <i class="fas fa-ruler-horizontal"></i> Length: ${lengthText} cm
        </span>`);
            }

            if (activeReportFilters.gender) {
                filters.push(`<span style="background: #FF9800; color: white; padding: 0.4rem 0.8rem; border-radius: 20px; font-size: 0.85rem;">
            <i class="fas fa-venus-mars"></i> Gender: ${activeReportFilters.gender}
        </span>`);
            }

            if (filters.length > 0) {
                filtersList.innerHTML = filters.join('');
                displayContainer.style.display = 'block';
            } else {
                displayContainer.style.display = 'none';
            }
        }

        // Filter Pigs Based on Criteria
        function filterPigs(pigs) {
            return pigs.filter(pig => {
                // Breed filter
                if (activeReportFilters.breed && pig.breed !== activeReportFilters.breed) {
                    return false;
                }

                // Age filter
                if (activeReportFilters.age !== null) {
                    if (activeReportFilters.ageComparator === 'exact' && pig.age !== activeReportFilters.age) {
                        return false;
                    } else if (activeReportFilters.ageComparator === 'below' && pig.age >= activeReportFilters.age) {
                        return false;
                    } else if (activeReportFilters.ageComparator === 'above' && pig.age <= activeReportFilters.age) {
                        return false;
                    }
                }

                // Weight filter
                if (activeReportFilters.weight !== null) {
                    if (activeReportFilters.weightComparator === 'exact' && pig.weight !== activeReportFilters.weight) {
                        return false;
                    } else if (activeReportFilters.weightComparator === 'below' && pig.weight > activeReportFilters.weight) {
                        return false;
                    } else if (activeReportFilters.weightComparator === 'above' && pig.weight < activeReportFilters.weight) {
                        return false;
                    }
                }

                // Length filter
                if (activeReportFilters.length !== null) {
                    if (activeReportFilters.lengthComparator === 'exact' && pig.length !== activeReportFilters.length) {
                        return false;
                    } else if (activeReportFilters.lengthComparator === 'below' && pig.length > activeReportFilters.length) {
                        return false;
                    } else if (activeReportFilters.lengthComparator === 'above' && pig.length < activeReportFilters.length) {
                        return false;
                    }
                }

                // Gender filter
                if (activeReportFilters.gender && pig.gender !== activeReportFilters.gender) {
                    return false;
                }

                return true;
            });
        }

        // Reports Generation
        function generateReport() {
            const startDate = document.getElementById('reportStartDate').value;
            const endDate = document.getElementById('reportEndDate').value;

            if (!startDate || !endDate) {
                showNotification('Please select both start and end dates', 'error');
                return;
            }

            // Validate date range
            const start = new Date(startDate);
            const end = new Date(endDate);

            if (start > end) {
                showNotification('Start date cannot be after end date', 'error');
                return;
            }

            generatePDFReport(startDate, endDate);
        }

        async function generatePDFReport(startDate, endDate) {
            try {
                showNotification('Generating report, please wait...', 'info');

                // Convert dates to timestamps
                const startTimestamp = new Date(startDate).setHours(0, 0, 0, 0);
                const endTimestamp = new Date(endDate).setHours(23, 59, 59, 999);

                // Fetch pigs data
                const pigsSnapshot = await firestore.collection('pigs')
                    .where('userId', '==', currentUser.uid)
                    .get();

                // Fetch edit history within date range
                const historySnapshot = await firestore.collection('pigEditHistory')
                    .where('userId', '==', currentUser.uid)
                    .where('timestamp', '>=', startTimestamp)
                    .where('timestamp', '<=', endTimestamp)
                    .orderBy('timestamp', 'desc')
                    .get();

                // Fetch sensor data within date range
                const sensorRef = database.ref(`sensorData/${currentUser.uid}`);
                const sensorSnapshot = await sensorRef
                    .orderByChild('timestamp')
                    .startAt(startTimestamp)
                    .endAt(endTimestamp)
                    .once('value');

                const sensorData = [];
                sensorSnapshot.forEach(child => {
                    sensorData.push(child.val());
                });

                // Calculate average temperature and humidity from filtered data
                const avgTemp = sensorData.length > 0
                    ? (sensorData.reduce((sum, d) => sum + (parseFloat(d.temperature) || 0), 0) / sensorData.length).toFixed(2)
                    : 0;
                const avgHumidity = sensorData.length > 0
                    ? (sensorData.reduce((sum, d) => sum + (parseFloat(d.humidity) || 0), 0) / sensorData.length).toFixed(2)
                    : 0;
                const avgPigTemp = sensorData.length > 0
                    ? (sensorData.reduce((sum, d) => sum + (parseFloat(d.pigBodyTemp) || 0), 0) / sensorData.length).toFixed(2)
                    : 0;

                // Temperature status
                let tempStatus = 'Normal';
                let tempColor = '#4CAF50';
                if (avgTemp < 30) {
                    tempStatus = 'Abnormal - Cold';
                    tempColor = '#2196F3';
                } else if (avgTemp > 34) {
                    tempStatus = 'Abnormal - Hot';
                    tempColor = '#F44336';
                }

                // Humidity status
                let humidityStatus = 'Normal';
                let humidityColor = '#4CAF50';
                if (avgHumidity < 40) {
                    humidityStatus = 'Abnormal - Too Dry';
                    humidityColor = '#FF9800';
                } else if (avgHumidity > 75) {
                    humidityStatus = 'Abnormal - Too Humid';
                    humidityColor = '#F44336';
                }

                // Pig body temperature status
                let pigTempStatus = 'Normal';
                let pigTempColor = '#4CAF50';
                if (avgPigTemp < 38) {
                    pigTempStatus = 'Below Normal';
                    pigTempColor = '#2196F3';
                } else if (avgPigTemp > 40) {
                    pigTempStatus = 'Above Normal - Possible Fever';
                    pigTempColor = '#F44336';
                }

                let allPigsData = [];
                let totalRevenue = 0;

                pigsSnapshot.forEach(doc => {
                    const pig = doc.data();
                    allPigsData.push({ id: doc.id, ...pig });

                    // Calculate revenue for sold pigs within date range
                    if (pig.status === 'sold' && pig.saleDate && pig.saleDate >= startTimestamp && pig.saleDate <= endTimestamp) {
                        totalRevenue += pig.saleAmount || 0;
                    }
                });

                // Apply filters to pigs for overall statistics
                const filteredPigsData = filterPigs(allPigsData);

                // Count statistics from filtered pigs
                let totalPigs = filteredPigsData.length;
                let activePigs = 0;
                let soldPigs = 0;

                filteredPigsData.forEach(pig => {
                    if (pig.status === 'active') activePigs++;
                    if (pig.status === 'sold') soldPigs++;
                });

                // Build filter description
                let filterDescription = '';
                let hasFilters = false;

                if (activeReportFilters.breed || activeReportFilters.age !== null || activeReportFilters.weight !== null ||
                    activeReportFilters.length !== null || activeReportFilters.gender) {
                    hasFilters = true;
                    filterDescription = '<div style="background: rgba(233, 30, 99, 0.08); padding: 1rem; border-radius: 8px; margin-bottom: 1.5rem; border-left: 4px solid #E91E63;">';
                    filterDescription += '<strong style="color: #C2185B;"><i class="fas fa-filter"></i> Active Filters:</strong> ';
                    const filters = [];
                    if (activeReportFilters.breed) filters.push(`Breed: ${activeReportFilters.breed}`);
                    if (activeReportFilters.age !== null) {
                        const ageText = activeReportFilters.ageComparator === 'exact' ? `Exactly ${activeReportFilters.age}` :
                            activeReportFilters.ageComparator === 'below' ? `Below ${activeReportFilters.age}` :
                                `Above ${activeReportFilters.age}`;
                        filters.push(`Age: ${ageText} months`);
                    }
                    if (activeReportFilters.weight !== null) {
                        const weightText = activeReportFilters.weightComparator === 'exact' ? `Exactly ${activeReportFilters.weight}` :
                            activeReportFilters.weightComparator === 'below' ? `≤ ${activeReportFilters.weight}` :
                                `≥ ${activeReportFilters.weight}`;
                        filters.push(`Weight: ${weightText} kg`);
                    }
                    if (activeReportFilters.length !== null) {
                        const lengthText = activeReportFilters.lengthComparator === 'exact' ? `Exactly ${activeReportFilters.length}` :
                            activeReportFilters.lengthComparator === 'below' ? `≤ ${activeReportFilters.length}` :
                                `≥ ${activeReportFilters.length}`;
                        filters.push(`Length: ${lengthText} cm`);
                    }
                    if (activeReportFilters.gender) filters.push(`Gender: ${activeReportFilters.gender}`);
                    filterDescription += filters.join(' | ');
                    filterDescription += '</div>';
                }

                // Build filtered pig sections - APPLY EACH FILTER INDIVIDUALLY
                let filteredPigSections = '';

                if (hasFilters) {
                    // Group by Breed if filtered
                    if (activeReportFilters.breed) {
                        const breedPigs = allPigsData.filter(p => p.breed === activeReportFilters.breed);
                        if (breedPigs.length > 0) {
                            filteredPigSections += `
                        <div style="margin-bottom: 2rem; page-break-inside: avoid;">
                            <h3 style="color: #E91E63; font-size: 1.3rem; margin-bottom: 1rem; padding-bottom: 0.5rem; border-bottom: 2px solid #FCE4EC;">
                                <i class="fas fa-dna"></i> Breed: ${activeReportFilters.breed} (${breedPigs.length} pig${breedPigs.length > 1 ? 's' : ''})
                            </h3>
                            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 1rem;">
                                ${breedPigs.map(pig => `
                                    <div style="background: white; padding: 1rem; border-radius: 8px; border: 2px solid #E8E8E8;">
                                        <div style="font-weight: 700; color: #E91E63; margin-bottom: 0.5rem; font-size: 1rem;">${pig.tagNumber}</div>
                                        <div style="font-size: 0.8rem; color: #666;">
                                            <div><strong>Age:</strong> ${pig.age} mo</div>
                                            <div><strong>Weight:</strong> ${pig.weight} kg</div>
                                            <div><strong>Length:</strong> ${pig.length} cm</div>
                                            <div><strong>Gender:</strong> ${pig.gender}</div>
                                            <div style="margin-top: 0.5rem;">
                                                <span style="padding: 0.25rem 0.5rem; border-radius: 10px; font-size: 0.7rem; font-weight: 700; background: ${pig.status === 'active' ? 'rgba(76, 175, 80, 0.12)' : 'rgba(244, 67, 54, 0.12)'}; color: ${pig.status === 'active' ? '#4CAF50' : '#F44336'};">
                                                    ${pig.status.toUpperCase()}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    `;
                        }
                    }

                    // Group by Age if filtered
                    if (activeReportFilters.age !== null) {
                        let agePigs = [];
                        if (activeReportFilters.ageComparator === 'exact') {
                            agePigs = allPigsData.filter(p => p.age === activeReportFilters.age);
                        } else if (activeReportFilters.ageComparator === 'below') {
                            agePigs = allPigsData.filter(p => p.age < activeReportFilters.age);
                        } else {
                            agePigs = allPigsData.filter(p => p.age > activeReportFilters.age);
                        }

                        let ageTitle = '';
                        if (activeReportFilters.ageComparator === 'exact') {
                            ageTitle = `Age: Exactly ${activeReportFilters.age} months`;
                        } else if (activeReportFilters.ageComparator === 'below') {
                            ageTitle = `Age: Below ${activeReportFilters.age} months`;
                        } else {
                            ageTitle = `Age: Above ${activeReportFilters.age} months`;
                        }

                        if (agePigs.length > 0) {
                            filteredPigSections += `
                        <div style="margin-bottom: 2rem; page-break-inside: avoid;">
                            <h3 style="color: #E91E63; font-size: 1.3rem; margin-bottom: 1rem; padding-bottom: 0.5rem; border-bottom: 2px solid #FCE4EC;">
                                <i class="fas fa-calendar-alt"></i> ${ageTitle} (${agePigs.length} pig${agePigs.length > 1 ? 's' : ''})
                            </h3>
                            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 1rem;">
                                ${agePigs.map(pig => `
                                    <div style="background: white; padding: 1rem; border-radius: 8px; border: 2px solid #E8E8E8;">
                                        <div style="font-weight: 700; color: #E91E63; margin-bottom: 0.5rem; font-size: 1rem;">${pig.tagNumber}</div>
                                        <div style="font-size: 0.8rem; color: #666;">
                                            <div><strong>Breed:</strong> ${pig.breed}</div>
                                            <div><strong>Age:</strong> ${pig.age} mo</div>
                                            <div><strong>Weight:</strong> ${pig.weight} kg</div>
                                            <div><strong>Length:</strong> ${pig.length} cm</div>
                                            <div><strong>Gender:</strong> ${pig.gender}</div>
                                            <div style="margin-top: 0.5rem;">
                                                <span style="padding: 0.25rem 0.5rem; border-radius: 10px; font-size: 0.7rem; font-weight: 700; background: ${pig.status === 'active' ? 'rgba(76, 175, 80, 0.12)' : 'rgba(244, 67, 54, 0.12)'}; color: ${pig.status === 'active' ? '#4CAF50' : '#F44336'};">
                                                    ${pig.status.toUpperCase()}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    `;
                        }
                    }

                    // Group by Weight if filtered
                    if (activeReportFilters.weight !== null) {
                        let weightPigs = [];
                        if (activeReportFilters.weightComparator === 'exact') {
                            weightPigs = allPigsData.filter(p => p.weight === activeReportFilters.weight);
                        } else if (activeReportFilters.weightComparator === 'below') {
                            weightPigs = allPigsData.filter(p => p.weight <= activeReportFilters.weight);
                        } else {
                            weightPigs = allPigsData.filter(p => p.weight >= activeReportFilters.weight);
                        }

                        let weightTitle = '';
                        if (activeReportFilters.weightComparator === 'exact') {
                            weightTitle = `Weight: Exactly ${activeReportFilters.weight} kg`;
                        } else if (activeReportFilters.weightComparator === 'below') {
                            weightTitle = `Weight: ${activeReportFilters.weight} kg and Below`;
                        } else {
                            weightTitle = `Weight: ${activeReportFilters.weight} kg and Above`;
                        }

                        if (weightPigs.length > 0) {
                            filteredPigSections += `
                        <div style="margin-bottom: 2rem; page-break-inside: avoid;">
                            <h3 style="color: #E91E63; font-size: 1.3rem; margin-bottom: 1rem; padding-bottom: 0.5rem; border-bottom: 2px solid #FCE4EC;">
                                <i class="fas fa-weight"></i> ${weightTitle} (${weightPigs.length} pig${weightPigs.length > 1 ? 's' : ''})
                            </h3>
                            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 1rem;">
                                ${weightPigs.map(pig => `
                                    <div style="background: white; padding: 1rem; border-radius: 8px; border: 2px solid #E8E8E8;">
                                        <div style="font-weight: 700; color: #E91E63; margin-bottom: 0.5rem; font-size: 1rem;">${pig.tagNumber}</div>
                                        <div style="font-size: 0.8rem; color: #666;">
                                            <div><strong>Breed:</strong> ${pig.breed}</div>
                                            <div><strong>Age:</strong> ${pig.age} mo</div>
                                            <div><strong>Weight:</strong> ${pig.weight} kg</div>
                                            <div><strong>Length:</strong> ${pig.length} cm</div>
                                            <div><strong>Gender:</strong> ${pig.gender}</div>
                                            <div style="margin-top: 0.5rem;">
                                                <span style="padding: 0.25rem 0.5rem; border-radius: 10px; font-size: 0.7rem; font-weight: 700; background: ${pig.status === 'active' ? 'rgba(76, 175, 80, 0.12)' : 'rgba(244, 67, 54, 0.12)'}; color: ${pig.status === 'active' ? '#4CAF50' : '#F44336'};">
                                                    ${pig.status.toUpperCase()}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    `;
                        }
                    }

                    // Group by Length if filtered
                    if (activeReportFilters.length !== null) {
                        let lengthPigs = [];
                        if (activeReportFilters.lengthComparator === 'exact') {
                            lengthPigs = allPigsData.filter(p => p.length === activeReportFilters.length);
                        } else if (activeReportFilters.lengthComparator === 'below') {
                            lengthPigs = allPigsData.filter(p => p.length <= activeReportFilters.length);
                        } else {
                            lengthPigs = allPigsData.filter(p => p.length >= activeReportFilters.length);
                        }

                        let lengthTitle = '';
                        if (activeReportFilters.lengthComparator === 'exact') {
                            lengthTitle = `Length: Exactly ${activeReportFilters.length} cm`;
                        } else if (activeReportFilters.lengthComparator === 'below') {
                            lengthTitle = `Length: ${activeReportFilters.length} cm and Below`;
                        } else {
                            lengthTitle = `Length: ${activeReportFilters.length} cm and Above`;
                        }

                        if (lengthPigs.length > 0) {
                            filteredPigSections += `
                        <div style="margin-bottom: 2rem; page-break-inside: avoid;">
                            <h3 style="color: #E91E63; font-size: 1.3rem; margin-bottom: 1rem; padding-bottom: 0.5rem; border-bottom: 2px solid #FCE4EC;">
                                <i class="fas fa-ruler-horizontal"></i> ${lengthTitle} (${lengthPigs.length} pig${lengthPigs.length > 1 ? 's' : ''})
                            </h3>
                            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 1rem;">
                                ${lengthPigs.map(pig => `
                                    <div style="background: white; padding: 1rem; border-radius: 8px; border: 2px solid #E8E8E8;">
                                        <div style="font-weight: 700; color: #E91E63; margin-bottom: 0.5rem; font-size: 1rem;">${pig.tagNumber}</div>
                                        <div style="font-size: 0.8rem; color: #666;">
                                            <div><strong>Breed:</strong> ${pig.breed}</div>
                                            <div><strong>Age:</strong> ${pig.age} mo</div>
                                            <div><strong>Weight:</strong> ${pig.weight} kg</div>
                                            <div><strong>Length:</strong> ${pig.length} cm</div>
                                            <div><strong>Gender:</strong> ${pig.gender}</div>
                                            <div style="margin-top: 0.5rem;">
                                                <span style="padding: 0.25rem 0.5rem; border-radius: 10px; font-size: 0.7rem; font-weight: 700; background: ${pig.status === 'active' ? 'rgba(76, 175, 80, 0.12)' : 'rgba(244, 67, 54, 0.12)'}; color: ${pig.status === 'active' ? '#4CAF50' : '#F44336'};">
                                                    ${pig.status.toUpperCase()}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    `;
                        }
                    }

                    // Group by Gender if filtered
                    if (activeReportFilters.gender) {
                        const genderPigs = allPigsData.filter(p => p.gender === activeReportFilters.gender);
                        if (genderPigs.length > 0) {
                            filteredPigSections += `
                        <div style="margin-bottom: 2rem; page-break-inside: avoid;">
                            <h3 style="color: #E91E63; font-size: 1.3rem; margin-bottom: 1rem; padding-bottom: 0.5rem; border-bottom: 2px solid #FCE4EC;">
                                <i class="fas fa-venus-mars"></i> Gender: ${activeReportFilters.gender} (${genderPigs.length} pig${genderPigs.length > 1 ? 's' : ''})
                            </h3>
                            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 1rem;">
                                ${genderPigs.map(pig => `
                                    <div style="background: white; padding: 1rem; border-radius: 8px; border: 2px solid #E8E8E8;">
                                        <div style="font-weight: 700; color: #E91E63; margin-bottom: 0.5rem; font-size: 1rem;">${pig.tagNumber}</div>
                                        <div style="font-size: 0.8rem; color: #666;">
                                            <div><strong>Breed:</strong> ${pig.breed}</div>
                                            <div><strong>Age:</strong> ${pig.age} mo</div>
                                            <div><strong>Weight:</strong> ${pig.weight} kg</div>
                                            <div><strong>Length:</strong> ${pig.length} cm</div>
                                            <div style="margin-top: 0.5rem;">
                                                <span style="padding: 0.25rem 0.5rem; border-radius: 10px; font-size: 0.7rem; font-weight: 700; background: ${pig.status === 'active' ? 'rgba(76, 175, 80, 0.12)' : 'rgba(244, 67, 54, 0.12)'}; color: ${pig.status === 'active' ? '#4CAF50' : '#F44336'};">
                                                    ${pig.status.toUpperCase()}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    `;
                        }
                    }
                }

                const reportContent = document.getElementById('reportContent');
                reportContent.innerHTML = `
            <div id="pdfContent" style="font-family: 'Inter', Arial, sans-serif; padding: 2rem; background: white;">
                <div style="text-align: center; margin-bottom: 3rem; padding-bottom: 2rem; border-bottom: 3px solid #E91E63;">
                    <div style="background: linear-gradient(135deg, #E91E63, #C2185B); color: white; padding: 2rem; border-radius: 16px; margin-bottom: 1.5rem;">
                        <h1 style="margin-bottom: 0.5rem; font-size: 2.2rem; font-weight: 800;">SwineCare Management Report</h1>
                        <p style="font-size: 1.1rem; opacity: 0.95;">Comprehensive Pig Management Summary</p>
                        <p style="opacity: 0.9; margin-top: 0.5rem;">Period: ${new Date(startDate).toLocaleDateString()} to ${new Date(endDate).toLocaleDateString()}</p>
                        <p style="opacity: 0.85; margin-top: 0.3rem; font-size: 0.9rem;">Data points collected: ${sensorData.length}</p>
                    </div>
                </div>

                ${filterDescription}

                <div style="margin-bottom: 2.5rem;">
                    <h2 style="color: #C2185B; margin-bottom: 1.5rem; font-size: 1.6rem; font-weight: 700; border-left: 4px solid #E91E63; padding-left: 1rem;">
                        Overall Statistics ${hasFilters ? '(Filtered - Combined Criteria)' : ''}
                    </h2>
                    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; margin-bottom: 1rem;">
                        <div style="background: rgba(233, 30, 99, 0.08); padding: 1.5rem; border-radius: 12px; border-left: 4px solid #E91E63; text-align: center;">
                            <div style="font-size: 0.8rem; color: #666; text-transform: uppercase; font-weight: 700; margin-bottom: 0.5rem;">Total Pigs${hasFilters ? ' (All Filters)' : ''}</div>
                            <div style="font-size: 2.2rem; font-weight: 800; color: #E91E63;">${totalPigs}</div>
                        </div>
                        <div style="background: rgba(76, 175, 80, 0.08); padding: 1.5rem; border-radius: 12px; border-left: 4px solid #4CAF50; text-align: center;">
                            <div style="font-size: 0.8rem; color: #666; text-transform: uppercase; font-weight: 700; margin-bottom: 0.5rem;">Active</div>
                            <div style="font-size: 2.2rem; font-weight: 800; color: #4CAF50;">${activePigs}</div>
                        </div>
                        <div style="background: rgba(244, 67, 54, 0.08); padding: 1.5rem; border-radius: 12px; border-left: 4px solid #F44336; text-align: center;">
                            <div style="font-size: 0.8rem; color: #666; text-transform: uppercase; font-weight: 700; margin-bottom: 0.5rem;">Sold</div>
                            <div style="font-size: 2.2rem; font-weight: 800; color: #F44336;">${soldPigs}</div>
                        </div>
                    </div>
                    ${totalRevenue > 0 ? `
                        <div style="background: rgba(255, 152, 0, 0.08); padding: 1.2rem; border-radius: 12px; border-left: 4px solid #FF9800; text-align: center;">
                            <div style="font-size: 0.85rem; color: #666; text-transform: uppercase; font-weight: 700; margin-bottom: 0.5rem;">Revenue from Sales (${startDate} to ${endDate})</div>
                            <div style="font-size: 2rem; font-weight: 800; color: #FF9800;">₱${totalRevenue.toLocaleString()}</div>
                        </div>
                    ` : ''}
                </div>

                <div style="margin-bottom: 2.5rem;">
                    <h2 style="color: #C2185B; margin-bottom: 1.5rem; font-size: 1.6rem; font-weight: 700; border-left: 4px solid #E91E63; padding-left: 1rem;">
                        Environmental Conditions (${startDate} to ${endDate})
                    </h2>
                    
                    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.5rem;">
                        <div style="background: white; padding: 1.5rem; border-radius: 12px; border: 2px solid #E8E8E8;">
                            <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem;">
                                <div style="width: 50px; height: 50px; background: rgba(233, 30, 99, 0.1); border-radius: 12px; display: flex; align-items: center; justify-content: center;">
                                    <i class="fas fa-thermometer-half" style="color: #E91E63; font-size: 1.5rem;"></i>
                                </div>
                                <div>
                                    <div style="font-size: 0.85rem; color: #666; font-weight: 700; text-transform: uppercase;">Ambient Temp</div>
                                    <div style="font-size: 1.8rem; font-weight: 800; color: ${tempColor};">${avgTemp}°C</div>
                                </div>
                            </div>
                            <div style="padding: 0.8rem; background: ${tempColor}15; border-left: 4px solid ${tempColor}; border-radius: 8px;">
                                <strong style="color: ${tempColor};">Status: ${tempStatus}</strong>
                                <div style="font-size: 0.85rem; color: #666; margin-top: 0.3rem;">
                                    ${avgTemp >= 30 && avgTemp <= 34 ? '✓ Within normal range (30-34°C)' :
                        avgTemp < 30 ? '⚠ Below normal range' :
                            '⚠ Above normal range'}
                                </div>
                            </div>
                        </div>

                        <div style="background: white; padding: 1.5rem; border-radius: 12px; border: 2px solid #E8E8E8;">
                            <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem;">
                                <div style="width: 50px; height: 50px; background: rgba(3, 169, 244, 0.1); border-radius: 12px; display: flex; align-items: center; justify-content: center;">
                                    <i class="fas fa-tint" style="color: #03A9F4; font-size: 1.5rem;"></i>
                                </div>
                                <div>
                                    <div style="font-size: 0.85rem; color: #666; font-weight: 700; text-transform: uppercase;">Humidity</div>
                                    <div style="font-size: 1.8rem; font-weight: 800; color: ${humidityColor};">${avgHumidity}%</div>
                                </div>
                            </div>
                            <div style="padding: 0.8rem; background: ${humidityColor}15; border-left: 4px solid ${humidityColor}; border-radius: 8px;">
                                <strong style="color: ${humidityColor};">Status: ${humidityStatus}</strong>
                                <div style="font-size: 0.85rem; color: #666; margin-top: 0.3rem;">
                                    ${avgHumidity >= 50 && avgHumidity <= 70 ? '✓ Within normal range (50-70%)' :
                        avgHumidity < 40 ? '⚠ Too dry' :
                            avgHumidity > 75 ? '⚠ Too humid' :
                                '⚠ Slightly outside range'}
                                </div>
                            </div>
                        </div>

                        <div style="background: white; padding: 1.5rem; border-radius: 12px; border: 2px solid #E8E8E8;">
                            <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem;">
                                <div style="width: 50px; height: 50px; background: rgba(255, 64, 129, 0.1); border-radius: 12px; display: flex; align-items: center; justify-content: center;">
                                    <i class="fas fa-heartbeat" style="color: #FF4081; font-size: 1.5rem;"></i>
                                </div>
                                <div>
                                    <div style="font-size: 0.85rem; color: #666; font-weight: 700; text-transform: uppercase;">Pig Body Temp</div>
                                    <div style="font-size: 1.8rem; font-weight: 800; color: ${pigTempColor};">${avgPigTemp}°C</div>
                                </div>
                            </div>
                            <div style="padding: 0.8rem; background: ${pigTempColor}15; border-left: 4px solid ${pigTempColor}; border-radius: 8px;">
                                <strong style="color: ${pigTempColor};">Status: ${pigTempStatus}</strong>
                                <div style="font-size: 0.85rem; color: #666; margin-top: 0.3rem;">
                                    ${avgPigTemp >= 38 && avgPigTemp <= 40 ? '✓ Within normal range (38-40°C)' :
                        avgPigTemp < 38 ? '⚠ Below normal' :
                            '⚠ Above normal - Check health'}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                ${hasFilters && filteredPigSections ? `
                    <div style="margin-bottom: 2.5rem;">
                        <h2 style="color: #C2185B; margin-bottom: 1.5rem; font-size: 1.6rem; font-weight: 700; border-left: 4px solid #E91E63; padding-left: 1rem;">
                            Filtered Pigs Summary (Individual Filters)
                        </h2>
                        ${filteredPigSections}
                    </div>
                ` : ''}

                ${!hasFilters ? `
                    <div style="margin-bottom: 2.5rem; text-align: center; padding: 3rem; background: rgba(233, 30, 99, 0.05); border-radius: 12px;">
                        <i class="fas fa-info-circle" style="font-size: 3rem; color: var(--primary-pink); opacity: 0.3; margin-bottom: 1rem; display: block;"></i>
                        <p style="color: #666; font-size: 1.1rem;">No filters applied. Use the Advanced Filters to generate specific pig reports.</p>
                    </div>
                ` : ''}

                <div style="text-align: center; margin-top: 4rem; padding-top: 2rem; border-top: 2px solid #E8E8E8;">
                    <p style="color: #666; font-size: 0.9rem; line-height: 1.8;">
                        <strong style="color: #E91E63;">Generated on:</strong> ${new Date().toLocaleString()}<br>
                        <strong style="color: #E91E63;">Report Period:</strong> ${new Date(startDate).toLocaleDateString()} to ${new Date(endDate).toLocaleDateString()}<br>
                        <strong style="color: #E91E63;">SwineCare</strong> - Your Swine Health Monitoring & Management System
                    </p>
                </div>
            </div>
        `;

                // Generate PDF
                const { jsPDF } = window.jspdf;
                const pdf = new jsPDF('p', 'mm', 'a4');

                const element = document.getElementById('pdfContent');
                const canvas = await html2canvas(element, {
                    scale: 2,
                    useCORS: true,
                    backgroundColor: '#ffffff',
                    logging: false
                });

                const imgData = canvas.toDataURL('image/png');
                const imgWidth = 210;
                const pageHeight = 295;
                const imgHeight = (canvas.height * imgWidth) / canvas.width;
                let heightLeft = imgHeight;

                let position = 0;

                pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
                heightLeft -= pageHeight;

                while (heightLeft >= 0) {
                    position = heightLeft - imgHeight;
                    pdf.addPage();
                    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
                    heightLeft -= pageHeight;
                }

                const filename = `SwineCare_Report_${startDate}_to_${endDate}${hasFilters ? '_Filtered' : ''}.pdf`;
                pdf.save(filename);
                showNotification('PDF report generated successfully!', 'success');

            } catch (error) {
                showNotification(`Report generation failed: ${error.message}`, 'error');
                console.error('Report generation error:', error);
            }
        }

        // Setup Realtime Listeners
        function setupRealtimeListeners() {
            if (!currentUser) return;

            setupAppListener();

            database.ref(`sensorData/${currentUser.uid}`).limitToLast(1).on('child_added', (snapshot) => {
                const data = snapshot.val();
                if (data) {
                    document.getElementById('temperature').innerHTML = `${data.temperature}<span class="stat-unit">°C</span>`;
                    document.getElementById('humidity').innerHTML = `${data.humidity}<span class="stat-unit">%</span>`;
                    document.getElementById('pigBodyTemp').innerHTML = `${data.pigBodyTemp}<span class="stat-unit">°C</span>`;
                }
            });

            firestore.collection('pigs')
                .where('userId', '==', currentUser.uid)
                .onSnapshot((snapshot) => {
                    loadPigs();
                });
        }

        // Check for remembered user on page load
        window.addEventListener('load', () => {
            if (localStorage.getItem('rememberMe') === 'true') {
                const savedEmail = localStorage.getItem('userEmail');
                if (savedEmail) {
                    document.getElementById('loginEmail').value = savedEmail;
                    document.getElementById('rememberMe').checked = true;
                }
            }

            const today = new Date();
            const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
            document.getElementById('reportStartDate').value = weekAgo.toISOString().split('T')[0];
            document.getElementById('reportEndDate').value = today.toISOString().split('T')[0];
        });

        // Auth State Observer
        auth.onAuthStateChanged((user) => {
            if (user) {
                currentUser = user;
                showMainApp();
                startDataSimulation();
            } else {
                currentUser = null;
                stopDataSimulation();
                document.getElementById('authContainer').style.display = 'flex';
                document.getElementById('appContainer').style.display = 'none';
            }
        });

        // Initialize charts when statistics page is shown
        let chartsInitialized = false;
        const originalShowPage = showPage;
        showPage = function (pageId) {
            originalShowPage.call(this, pageId);
            if (pageId === 'statistics' && !chartsInitialized) {
                setTimeout(() => {
                    initializeCharts();
                    updateCharts();
                    chartsInitialized = true;
                }, 100);
            }
        };

        // Close modals when clicking outside
        window.onclick = function (event) {
            const sellModal = document.getElementById('sellPigModal');
            const deleteModal = document.getElementById('deletePigModal');
            const editModal = document.getElementById('editPigModal');
            const historyModal = document.getElementById('historyModal');

            if (event.target === sellModal) {
                closeSellModal();
            }
            if (event.target === deleteModal) {
                closeDeleteModal();
            }
            if (event.target === editModal) {
                closeEditModal();
            }
            if (event.target === historyModal) {
                closeHistoryModal();
            }
        };

        // Real-time Sensor-based Notifications
        let lastNotificationTime = {
            highTemp: 0,
            lowTemp: 0,
            highHumidity: 0,
            lowHumidity: 0,
            pigFever: 0,
            pigLowTemp: 0
        };

        const NOTIFICATION_COOLDOWN = 5 * 60 * 1000; // 5 minutes cooldown between similar notifications

        // Monitor sensor data and generate accurate notifications
        function checkSensorAlerts() {
            if (!currentUser) return;

            const temperature = parseFloat(document.getElementById('temperature').textContent);
            const humidity = parseFloat(document.getElementById('humidity').textContent);
            const pigBodyTemp = parseFloat(document.getElementById('pigBodyTemp').textContent);

            const now = Date.now();

            // Check Ambient Temperature
            if (!isNaN(temperature)) {
                // High temperature alert (> 34°C)
                if (temperature > 34 && (now - lastNotificationTime.highTemp) > NOTIFICATION_COOLDOWN) {
                    addNotification(
                        'High Temperature Alert',
                        `Ambient temperature is ${temperature}°C - Above optimal range. Consider cooling the pen.`,
                        'error',
                        false  // Don't show toast popup
                    );
                    lastNotificationTime.highTemp = now;
                }
                // Low temperature alert (< 30°C)
                else if (temperature < 30 && (now - lastNotificationTime.lowTemp) > NOTIFICATION_COOLDOWN) {
                    addNotification(
                        'Low Temperature Alert',
                        `Ambient temperature is ${temperature}°C - Below optimal range. Consider heating the pen.`,
                        'warning',
                        false  // Don't show toast popup
                    );
                    lastNotificationTime.lowTemp = now;
                }
            }

            // Check Humidity
            if (!isNaN(humidity)) {
                // High humidity alert (> 75%)
                if (humidity > 75 && (now - lastNotificationTime.highHumidity) > NOTIFICATION_COOLDOWN) {
                    addNotification(
                        'High Humidity Alert',
                        `Humidity is ${humidity}% - Risk of respiratory disease. Improve ventilation.`,
                        'error',
                        false  // Don't show toast popup
                    );
                    lastNotificationTime.highHumidity = now;
                }
                // Low humidity alert (< 40%)
                else if (humidity < 40 && (now - lastNotificationTime.lowHumidity) > NOTIFICATION_COOLDOWN) {
                    addNotification(
                        'Low Humidity Alert',
                        `Humidity is ${humidity}% - Air is too dry. May cause respiratory issues.`,
                        'warning',
                        false  // Don't show toast popup
                    );
                    lastNotificationTime.lowHumidity = now;
                }
            }

            // Check Pig Body Temperature
            if (!isNaN(pigBodyTemp) && pigBodyTemp > 0) {
                // High pig temperature - possible fever (> 40°C)
                if (pigBodyTemp > 40 && (now - lastNotificationTime.pigFever) > NOTIFICATION_COOLDOWN) {
                    addNotification(
                        'Pig Health Alert - Fever',
                        `Pig body temperature is ${pigBodyTemp}°C - Possible fever detected. Veterinary attention recommended.`,
                        'error',
                        false  // Don't show toast popup
                    );
                    lastNotificationTime.pigFever = now;
                }
                // Elevated pig temperature (39-40°C)
                else if (pigBodyTemp >= 39 && pigBodyTemp <= 40 && (now - lastNotificationTime.pigFever) > NOTIFICATION_COOLDOWN) {
                    addNotification(
                        'Pig Health Alert - Elevated Temperature',
                        `Pig body temperature is ${pigBodyTemp}°C - Slightly elevated. Monitor closely.`,
                        'warning',
                        false  // Don't show toast popup
                    );
                    lastNotificationTime.pigFever = now;
                }
                // Low pig temperature (< 38°C)
                else if (pigBodyTemp < 38 && (now - lastNotificationTime.pigLowTemp) > NOTIFICATION_COOLDOWN) {
                    addNotification(
                        'Pig Health Alert - Low Temperature',
                        `Pig body temperature is ${pigBodyTemp}°C - Below normal range. Check pig health.`,
                        'warning',
                        false  // Don't show toast popup
                    );
                    lastNotificationTime.pigLowTemp = now;
                }
            }

            // Check for optimal conditions (less frequent)
            if (temperature >= 30 && temperature <= 34 &&
                humidity >= 50 && humidity <= 70 &&
                pigBodyTemp >= 38 && pigBodyTemp <= 40 &&
                Math.random() < 0.1) { // 10% chance to show this message

                const lastOptimal = localStorage.getItem('lastOptimalNotification');
                const timeSinceLastOptimal = lastOptimal ? (now - parseInt(lastOptimal)) : Infinity;

                // Show optimal condition notification once per hour
                if (timeSinceLastOptimal > 60 * 60 * 1000) {
                    addNotification(
                        'Optimal Conditions',
                        'All environmental parameters and pig health indicators are within normal range.',
                        'success',
                        false  // Don't show toast popup
                    );
                    localStorage.setItem('lastOptimalNotification', now.toString());
                }
            }
        }

        // Run sensor alerts check every 10 seconds
        setInterval(() => {
            if (currentUser) {
                checkSensorAlerts();
            }
        }, 10000);

        // Enhanced notification function with severity levels
        function addNotification(title, message, type) {
            const notificationsList = document.getElementById('notificationsList');

            const iconMap = {
                'error': 'fa-exclamation-circle',
                'warning': 'fa-exclamation-triangle',
                'success': 'fa-check-circle',
                'info': 'fa-info-circle'
            };

            const severityMap = {
                'error': 'Critical',
                'warning': 'Warning',
                'success': 'Normal',
                'info': 'Info'
            };

            const notificationEl = document.createElement('div');
            notificationEl.className = `alert alert-${type}`;
            notificationEl.style.animation = 'slideInRight 0.4s ease';
            notificationEl.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: start;">
            <div style="flex: 1;">
                <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.5rem;">
                    <i class="fas ${iconMap[type] || 'fa-bell'}" style="font-size: 1.3rem;"></i>
                    <div style="flex: 1;">
                        <strong style="font-size: 1.05rem;">${title}</strong>
                        <span style="margin-left: 0.5rem; padding: 0.2rem 0.5rem; background: rgba(255,255,255,0.3); border-radius: 4px; font-size: 0.7rem; font-weight: 700;">${severityMap[type]}</span>
                    </div>
                </div>
                <div style="margin-left: 2.05rem; line-height: 1.5;">${message}</div>
                <small style="opacity: 0.7; margin-left: 2.05rem; display: block; margin-top: 0.5rem;">
                    <i class="fas fa-clock" style="margin-right: 0.3rem;"></i>${new Date().toLocaleString()}
                </small>
            </div>
            <button onclick="this.parentElement.parentElement.remove()" 
                    style="background: none; border: none; cursor: pointer; padding: 0.5rem; margin-left: 1rem; opacity: 0.6; transition: opacity 0.2s;">
                <i class="fas fa-times" style="font-size: 1.2rem;"></i>
            </button>
        </div>
    `;

            notificationsList.insertBefore(notificationEl, notificationsList.firstChild);

            // Store in Firebase
            if (currentUser) {
                firestore.collection('notifications').add({
                    title: title,
                    message: message,
                    type: type,
                    severity: severityMap[type],
                    timestamp: Date.now(),
                    userId: currentUser.uid,
                    read: false
                }).catch(error => {
                    console.error('Error saving notification:', error);
                });
            }

            // Show toast notification for critical and warning alerts
            if (type === 'error' || type === 'warning') {
                showNotification(`${title}: ${message}`, type);
            }

            // Auto-remove old notifications (keep only last 50)
            const notifications = notificationsList.children;
            if (notifications.length > 50) {
                for (let i = 50; i < notifications.length; i++) {
                    notifications[i].remove();
                }
            }
        }

        // Load notifications from Firebase on startup
        async function loadNotifications() {
            if (!currentUser) return;

            try {
                const notificationsSnapshot = await firestore.collection('notifications')
                    .where('userId', '==', currentUser.uid)
                    .orderBy('timestamp', 'desc')
                    .limit(50)
                    .get();

                const notificationsList = document.getElementById('notificationsList');
                notificationsList.innerHTML = ''; // Clear existing

                if (notificationsSnapshot.empty) {
                    notificationsList.innerHTML = `
                <div style="text-align: center; padding: 3rem; color: var(--neutral-gray);">
                    <i class="fas fa-bell-slash" style="font-size: 3rem; margin-bottom: 1rem; display: block; opacity: 0.3;"></i>
                    <p>No notifications yet</p>
                </div>
            `;
                    return;
                }

                notificationsSnapshot.forEach(doc => {
                    const notification = doc.data();

                    const iconMap = {
                        'error': 'fa-exclamation-circle',
                        'warning': 'fa-exclamation-triangle',
                        'success': 'fa-check-circle',
                        'info': 'fa-info-circle'
                    };

                    const notificationEl = document.createElement('div');
                    notificationEl.className = `alert alert-${notification.type}`;
                    notificationEl.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: start;">
                    <div style="flex: 1;">
                        <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.5rem;">
                            <i class="fas ${iconMap[notification.type] || 'fa-bell'}" style="font-size: 1.3rem;"></i>
                            <div style="flex: 1;">
                                <strong style="font-size: 1.05rem;">${notification.title}</strong>
                                <span style="margin-left: 0.5rem; padding: 0.2rem 0.5rem; background: rgba(255,255,255,0.3); border-radius: 4px; font-size: 0.7rem; font-weight: 700;">${notification.severity || 'Info'}</span>
                            </div>
                        </div>
                        <div style="margin-left: 2.05rem; line-height: 1.5;">${notification.message}</div>
                        <small style="opacity: 0.7; margin-left: 2.05rem; display: block; margin-top: 0.5rem;">
                            <i class="fas fa-clock" style="margin-right: 0.3rem;"></i>${new Date(notification.timestamp).toLocaleString()}
                        </small>
                    </div>
                    <button onclick="deleteNotification('${doc.id}', this)" 
                            style="background: none; border: none; cursor: pointer; padding: 0.5rem; margin-left: 1rem; opacity: 0.6; transition: opacity 0.2s;">
                        <i class="fas fa-times" style="font-size: 1.2rem;"></i>
                    </button>
                </div>
            `;

                    notificationsList.appendChild(notificationEl);
                });

            } catch (error) {
                console.error('Error loading notifications:', error);
            }
        }

        // Delete notification from Firebase
        async function deleteNotification(notificationId, buttonElement) {
            try {
                await firestore.collection('notifications').doc(notificationId).delete();
                buttonElement.parentElement.parentElement.remove();
                showNotification('Notification deleted', 'info');
            } catch (error) {
                console.error('Error deleting notification:', error);
                showNotification('Failed to delete notification', 'error');
            }
        }

        // Add CSS animation for new notifications
        const style = document.createElement('style');
        style.textContent = `
    @keyframes slideInRight {
        from {
            opacity: 0;
            transform: translateX(100px);
        }
        to {
            opacity: 1;
            transform: translateX(0);
        }
    }
`;
        document.head.appendChild(style);

        // Update showMainApp to load notifications
        function showMainApp() {
            document.getElementById('authContainer').style.display = 'none';
            document.getElementById('appContainer').style.display = 'flex';

            const displayName = currentUser.displayName || 'Farmer';
            document.getElementById('userName').textContent = displayName;
            document.getElementById('userAvatar').textContent = displayName.charAt(0).toUpperCase();

            loadPigs();
            loadNotifications(); // Load notifications on startup
            setupRealtimeListeners();

            chartsInitialized = false;
        }

        // Mobile Sidebar Toggle with Backdrop
const sidebar = document.getElementById('sidebar');
const mainContent = document.getElementById('mainContent');
const menuBtn = document.querySelector('.mobile-menu-btn');
const backdrop = document.getElementById('sidebarBackdrop');

if (menuBtn) {
    menuBtn.addEventListener('click', () => {
        sidebar.classList.toggle('show');
        if (backdrop) backdrop.classList.toggle('show');
        document.body.classList.toggle('sidebar-open');
    });
}

document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', () => {
        if (window.innerWidth <= 768) {
            sidebar.classList.remove('show');
            if (backdrop) backdrop.classList.remove('show');
            document.body.classList.remove('sidebar-open');
        }
    });
});

// Close sidebar when clicking backdrop
if (backdrop) {
    backdrop.addEventListener('click', () => {
        sidebar.classList.remove('show');
        backdrop.classList.remove('show');
        document.body.classList.remove('sidebar-open');
    });
}

document.addEventListener('click', (e) => {
    if (window.innerWidth <= 768 && sidebar.classList.contains('show')) {
        if (!sidebar.contains(e.target) && !menuBtn.contains(e.target)) {
            sidebar.classList.remove('show');
            if (backdrop) backdrop.classList.remove('show');
            document.body.classList.remove('sidebar-open');
        }
    }
});