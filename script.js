const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
let BOARD_SIZE = 0;
const FRICTION = 0.98;

// Game State
let gameState = 'MENU'; // MENU, PLAYING, SHOP
let gameMode = 'pvp';
let coins = parseInt(localStorage.getItem('c_coins')) || 100;
let currentPlayer = 1;
let isTurnActive = false; // True if pieces are moving

// Control State
let inputState = 'IDLE'; // IDLE, SLIDING, AIMING
let drag = { startX: 0, startY: 0, currentX: 0, currentY: 0 };

// Entities
let striker = { x: 0, y: 0, vx: 0, vy: 0, r: 0, color: '#fff' };
let pieces = [];
let pockets = [];

// Shop
let skins = [
    {id:'white', name:'Classic', color:'#fff', price:0},
    {id:'gold', name:'Gold', color:'#ffd700', price:200},
    {id:'neon', name:'Neon', color:'#00ffff', price:500},
    {id:'red', name:'Red', color:'#ff4444', price:300}
];
let ownedSkins = JSON.parse(localStorage.getItem('c_skins')) || ['white'];
let currentSkin = localStorage.getItem('c_current') || '#fff';

// Resize
function resize() {
    BOARD_SIZE = Math.min(window.innerWidth, window.innerHeight) * 0.95;
    canvas.width = BOARD_SIZE;
    canvas.height = BOARD_SIZE;
    let r = BOARD_SIZE * 0.06;
    pockets = [{x:r,y:r}, {x:BOARD_SIZE-r,y:r}, {x:r,y:BOARD_SIZE-r}, {x:BOARD_SIZE-r,y:BOARD_SIZE-r}];
}
window.addEventListener('resize', resize);
resize();

// --- INPUT HANDLERS (The Fix) ---

canvas.addEventListener('touchstart', e => {
    if(gameState !== 'PLAYING' || isTurnActive) return;
    if(gameMode === 'ai' && currentPlayer === 2) return;
    
    e.preventDefault();
    let rect = canvas.getBoundingClientRect();
    let x = e.touches[0].clientX - rect.left;
    let y = e.touches[0].clientY - rect.top;

    // Check if touching striker to slide
    let dist = Math.hypot(x - striker.x, y - striker.y);
    
    if(dist < striker.r * 2) {
        inputState = 'SLIDING';
    } else {
        // Touched elsewhere? Start Aiming
        inputState = 'AIMING';
        drag.startX = x; drag.startY = y;
        drag.currentX = x; drag.currentY = y;
    }
}, {passive: false});

canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    if(inputState === 'IDLE') return;
    
    let rect = canvas.getBoundingClientRect();
    let x = e.touches[0].clientX - rect.left;
    let y = e.touches[0].clientY - rect.top;

    if(inputState === 'SLIDING') {
        // Slide along baseline
        striker.x = x;
        // Keep within board
        if(striker.x < striker.r + 10) striker.x = striker.r + 10;
        if(striker.x > BOARD_SIZE - striker.r - 10) striker.x = BOARD_SIZE - striker.r - 10;
    } else if(inputState === 'AIMING') {
        drag.currentX = x;
        drag.currentY = y;
    }
}, {passive: false});

canvas.addEventListener('touchend', e => {
    if(inputState === 'AIMING') {
        // Shoot!
        let dx = drag.startX - drag.currentX;
        let dy = drag.startY - drag.currentY;
        let power = Math.hypot(dx, dy);
        
        if(power > 10) { // Minimum pull
            power = Math.min(power, 150); // Max power cap
            let angle = Math.atan2(dy, dx);
            let force = power * 0.25;
            striker.vx = Math.cos(angle) * force;
            striker.vy = Math.sin(angle) * force;
            isTurnActive = true;
        }
    }
    inputState = 'IDLE';
});
function update() {
    if(gameState !== 'PLAYING') return;

    let moving = false;

    // Physics Loop
    [striker, ...pieces].forEach(p => {
        if(!p.active && p !== striker) return;

        if(Math.abs(p.vx) > 0.1 || Math.abs(p.vy) > 0.1) {
            p.x += p.vx;
            p.y += p.vy;
            p.vx *= FRICTION;
            p.vy *= FRICTION;
            moving = true;

            // Wall Bounce
            if(p.x < p.r) { p.x = p.r; p.vx *= -0.6; }
            if(p.x > BOARD_SIZE - p.r) { p.x = BOARD_SIZE - p.r; p.vx *= -0.6; }
            if(p.y < p.r) { p.y = p.r; p.vy *= -0.6; }
            if(p.y > BOARD_SIZE - p.r) { p.y = BOARD_SIZE - p.r; p.vy *= -0.6; }

            // Pocket Detection
            pockets.forEach(pkt => {
                if(Math.hypot(p.x - pkt.x, p.y - pkt.y) < BOARD_SIZE * 0.08) {
                    p.vx = 0; p.vy = 0;
                    if(p === striker) {
                        // Foul: Reset Striker
                        p.x = -1000; // Hide
                    } else {
                        p.active = false; // Scored
                        p.x = -1000;
                    }
                }
            });
        }
    });

    // Collision Resolution (Ball vs Ball)
    let all = [striker, ...pieces].filter(p => p.active || p === striker);
    for(let i=0; i<all.length; i++) {
        for(let j=i+1; j<all.length; j++) {
            let p1 = all[i], p2 = all[j];
            let dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
            let minDist = p1.r + p2.r;

            if(dist < minDist) {
                // 1. Resolve Overlap (The Fix for sticking)
                let angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
                let overlap = minDist - dist;
                let moveX = Math.cos(angle) * (overlap / 2);
                let moveY = Math.sin(angle) * (overlap / 2);
                p1.x -= moveX; p1.y -= moveY;
                p2.x += moveX; p2.y += moveY;

                // 2. Bounce Physics
                let normalX = (p2.x - p1.x) / dist;
                let normalY = (p2.y - p1.y) / dist;
                
                // Tangent
                let tangentX = -normalY;
                let tangentY = normalX;

                // Dot Product Tangent
                let dpTan1 = p1.vx * tangentX + p1.vy * tangentY;
                let dpTan2 = p2.vx * tangentX + p2.vy * tangentY;

                // Dot Product Normal
                let dpNorm1 = p1.vx * normalX + p1.vy * normalY;
                let dpNorm2 = p2.vx * normalX + p2.vy * normalY;

                // Conservation of momentum (Assume equal mass)
                let m1 = 1, m2 = 1;
                let p1Norm = (dpNorm1 * (m1 - m2) + 2 * m2 * dpNorm2) / (m1 + m2);
                let p2Norm = (dpNorm2 * (m2 - m1) + 2 * m1 * dpNorm1) / (m1 + m2);

                p1.vx = tangentX * dpTan1 + normalX * p1Norm;
                p1.vy = tangentY * dpTan1 + normalY * p1Norm;
                p2.vx = tangentX * dpTan2 + normalX * p2Norm;
                p2.vy = tangentY * dpTan2 + normalY * p2Norm;
            }
        }
    }

    // Turn Switching
    if(isTurnActive && !moving) {
        isTurnActive = false;
        
        // Simple logic: If striker potted, penalty. 
        if(striker.x === -1000) {
            // Foul logic here if needed
        }
        
        currentPlayer = currentPlayer === 1 ? 2 : 1;
        resetStriker();
        updateHUD();
        
        if(gameMode === 'ai' && currentPlayer === 2) {
            setTimeout(aiThink, 1000);
        }
    }
}

function aiThink() {
    let target = pieces.find(p => p.active);
    if(target) {
        let dx = target.x - striker.x;
        let dy = target.y - striker.y;
        let mag = Math.hypot(dx, dy);
        striker.vx = (dx / mag) * 15;
        striker.vy = (dy / mag) * 15;
        isTurnActive = true;
    } else {
        // Game Over probably
        alert("Game Over! AI Wins (or tie)");
        goToMenu();
    }
}
function draw() {
    // Clear
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw Pockets
    ctx.fillStyle = '#111';
    pockets.forEach(p => {
        ctx.beginPath(); ctx.arc(p.x, p.y, BOARD_SIZE * 0.06, 0, Math.PI*2); ctx.fill();
    });

    // Draw Aim Line (The Fix)
    if(inputState === 'AIMING' && currentPlayer === 1) {
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 4;
        ctx.setLineDash([10, 10]);
        // Inverse the drag to show shoot direction
        let dx = drag.startX - drag.currentX;
        let dy = drag.startY - drag.currentY;
        ctx.moveTo(striker.x, striker.y);
        ctx.lineTo(striker.x + dx * 3, striker.y + dy * 3);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    // Draw Pieces
    [...pieces, striker].forEach(p => {
        if(!p.active && p !== striker) return;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
        ctx.fillStyle = p.color;
        ctx.fill();
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 2;
        ctx.stroke();
    });
}

function loop() {
    update();
    draw();
    requestAnimationFrame(loop);
}

// --- GAME FLOW HELPERS ---

function startGame(mode) {
    gameMode = mode;
    gameState = 'PLAYING';
    pieces = [];
    currentPlayer = 1;
    
    // Setup Striker
    striker.r = BOARD_SIZE * 0.045;
    striker.color = currentSkin;
    resetStriker();

    // Setup Pieces (Carrom Triangle)
    let cx = BOARD_SIZE/2, cy = BOARD_SIZE/2;
    let r = BOARD_SIZE * 0.035;
    
    // Queen
    pieces.push({x:cx, y:cy, vx:0, vy:0, r:r, color:'#ff0055', type:'queen', active:true});
    
    // Circle
    for(let i=0; i<8; i++) {
        let ang = (i/8) * Math.PI*2;
        let dist = r * 2.1;
        pieces.push({
            x: cx + Math.cos(ang)*dist,
            y: cy + Math.sin(ang)*dist,
            vx:0, vy:0, r:r, active:true,
            color: i%2===0 ? '#eee' : '#222',
            type: i%2===0 ? 'white' : 'black'
        });
    }

    document.getElementById('menu').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
    updateHUD();
    loop();
}

function resetStriker() {
    striker.vx = 0; striker.vy = 0;
    striker.x = BOARD_SIZE / 2;
    // P1 shoots from bottom, P2 from top
    striker.y = currentPlayer === 1 ? BOARD_SIZE * 0.8 : BOARD_SIZE * 0.2;
    // Fix: Unhide striker if it was fouled
    if(striker.x === -1000) striker.x = BOARD_SIZE / 2; 
}

function updateHUD() {
    document.getElementById('turn-indicator').innerText = 
        gameMode === 'ai' && currentPlayer === 2 ? "AI Turn..." : "Player " + currentPlayer;
    document.getElementById('menu-coins').innerText = coins;
    document.getElementById('shop-coins').innerText = coins;
}

function goToMenu() {
    gameState = 'MENU';
    document.getElementById('hud').classList.add('hidden');
    document.getElementById('shop').classList.add('hidden');
    document.getElementById('menu').classList.remove('hidden');
}

function openShop() {
    document.getElementById('menu').classList.add('hidden');
    document.getElementById('shop').classList.remove('hidden');
    let list = document.getElementById('shop-list');
    list.innerHTML = '';
    skins.forEach(s => {
        let btn = document.createElement('div');
        let owned = ownedSkins.includes(s.id);
        btn.className = `shop-item ${owned ? 'owned' : ''}`;
        btn.innerHTML = `<strong>${s.name}</strong><br>${owned ? 'OWNED' : '💰'+s.price}`;
        btn.onclick = () => {
            if(owned) {
                currentSkin = s.color;
                localStorage.setItem('c_current', s.color);
                alert("Equipped " + s.name);
            } else if(coins >= s.price) {
                coins -= s.price;
                ownedSkins.push(s.id);
                localStorage.setItem('c_skins', JSON.stringify(ownedSkins));
                localStorage.setItem('c_coins', coins);
                updateHUD();
                openShop(); // Refresh
            }
        };
        list.appendChild(btn);
    });
}
function closeShop() {
    document.getElementById('shop').classList.add('hidden');
    document.getElementById('menu').classList.remove('hidden');
}
