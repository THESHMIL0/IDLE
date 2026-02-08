const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

// --- CONFIGURATION ---
let BOARD_SIZE = 600;
const FRICTION = 0.98;
const WALL_BOUNCE = 0.6;

// --- STATE ---
let gameState = 'MENU'; // MENU, PLAYING
let gameMode = 'ai'; // ai, pvp
let coins = parseInt(localStorage.getItem('c_coins')) || 100;
let currentPlayer = 1;
let isTurnActive = false; // True if balls are moving

// Touch State
let inputMode = 'NONE'; // NONE, SLIDING, AIMING
let drag = { startX: 0, startY: 0, currX: 0, currY: 0 };

// Entities
let striker = { x: 0, y: 0, vx: 0, vy: 0, r: 0, color: '#fff' };
let pucks = [];
let pockets = [];

// Shop Data
let skins = [
    {id:'white', name:'Classic', color:'#ffffff', price:0},
    {id:'gold', name:'Gold Pro', color:'#ffd700', price:200},
    {id:'neon', name:'Neon Blue', color:'#00ffff', price:500},
    {id:'ruby', name:'Ruby Red', color:'#ff0055', price:1000}
];
let owned = JSON.parse(localStorage.getItem('c_owned')) || ['white'];
let currentSkin = localStorage.getItem('c_skin') || '#ffffff';

// --- SETUP ---
function resize() {
    let min = Math.min(window.innerWidth, window.innerHeight);
    BOARD_SIZE = min * 0.95;
    canvas.width = BOARD_SIZE;
    canvas.height = BOARD_SIZE;
    
    // Pocket Positions
    let r = BOARD_SIZE * 0.06;
    pockets = [
        {x:r, y:r}, {x:BOARD_SIZE-r, y:r},
        {x:r, y:BOARD_SIZE-r}, {x:BOARD_SIZE-r, y:BOARD_SIZE-r}
    ];
}
window.addEventListener('resize', resize);
resize();

function startGame(mode) {
    gameMode = mode;
    gameState = 'PLAYING';
    currentPlayer = 1;
    isTurnActive = false;
    
    // Setup Striker
    striker.r = BOARD_SIZE * 0.045;
    striker.color = currentSkin;
    resetStriker();
    
    // Setup Pucks
    pucks = [];
    let cx = BOARD_SIZE/2, cy = BOARD_SIZE/2;
    let pr = BOARD_SIZE * 0.035;
    
    // Queen
    pucks.push({x:cx, y:cy, vx:0, vy:0, r:pr, color:'#ff0055', type:'queen', active:true});
    
    // Circle
    for(let i=0; i<8; i++) {
        let ang = (i/8) * Math.PI * 2;
        let dist = pr * 2.1;
        pucks.push({
            x: cx + Math.cos(ang)*dist,
            y: cy + Math.sin(ang)*dist,
            vx:0, vy:0, r:pr, active:true,
            color: i%2==0 ? '#eee' : '#222',
            type: i%2==0 ? 'white' : 'black'
        });
    }

    document.getElementById('menu').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
    updateUI();
    loop();
}

function resetStriker() {
    striker.vx = 0; striker.vy = 0;
    striker.x = BOARD_SIZE/2;
    // P1 bottom, P2 top
    striker.y = currentPlayer === 1 ? BOARD_SIZE*0.82 : BOARD_SIZE*0.18;
    
    // If striker stuck in hole, reset safely
    if(striker.x < 0) striker.x = BOARD_SIZE/2;
}

// --- PHYSICS ENGINE ---
function update() {
    if(gameState !== 'PLAYING') return;
    
    let moving = false;
    let all = [striker, ...pucks].filter(p => p.active || p === striker);

    all.forEach(p => {
        // Movement
        if(Math.abs(p.vx) > 0.05 || Math.abs(p.vy) > 0.05) {
            moving = true;
            p.x += p.vx;
            p.y += p.vy;
            p.vx *= FRICTION;
            p.vy *= FRICTION;

            // Walls
            if(p.x < p.r) { p.x=p.r; p.vx *= -WALL_BOUNCE; }
            if(p.x > BOARD_SIZE-p.r) { p.x=BOARD_SIZE-p.r; p.vx *= -WALL_BOUNCE; }
            if(p.y < p.r) { p.y=p.r; p.vy *= -WALL_BOUNCE; }
            if(p.y > BOARD_SIZE-p.r) { p.y=BOARD_SIZE-p.r; p.vy *= -WALL_BOUNCE; }

            // Pockets
            pockets.forEach(pkt => {
                let d = Math.hypot(p.x-pkt.x, p.y-pkt.y);
                if(d < BOARD_SIZE*0.06) {
                    p.vx = 0; p.vy = 0;
                    if(p === striker) {
                        // Foul
                        p.x = -500; // Hide
                    } else {
                        p.active = false;
                        p.x = -500;
                    }
                }
            });
        }
    });

    // Collisions (Ball vs Ball)
    for(let i=0; i<all.length; i++) {
        for(let j=i+1; j<all.length; j++) {
            let p1 = all[i], p2 = all[j];
            let dx = p2.x - p1.x;
            let dy = p2.y - p1.y;
            let dist = Math.hypot(dx, dy);
            let minDist = p1.r + p2.r;

            if(dist < minDist) {
                // Resolve Overlap (Prevents sticking)
                let angle = Math.atan2(dy, dx);
                let overlap = minDist - dist;
                let tx = Math.cos(angle) * overlap * 0.5;
                let ty = Math.sin(angle) * overlap * 0.5;
                p1.x -= tx; p1.y -= ty;
                p2.x += tx; p2.y += ty;

                // Bounce
                let nx = dx / dist;
                let ny = dy / dist;
                let kx = p1.vx - p2.vx;
                let ky = p1.vy - p2.vy;
                let p = 2 * (nx * kx + ny * ky) / 2; // Mass = 1
                p1.vx -= p * nx; p1.vy -= p * ny;
                p2.vx += p * nx; p2.vy += p * ny;
                moving = true;
            }
        }
    }

    // Turn Handling
    if(isTurnActive && !moving) {
        isTurnActive = false;
        currentPlayer = currentPlayer===1 ? 2 : 1;
        resetStriker();
        updateUI();

        if(gameMode === 'ai' && currentPlayer === 2) {
            setTimeout(aiTurn, 1000);
        }
    }
}

function aiTurn() {
    // Simple AI: Find closest active puck
    let target = pucks.find(p => p.active);
    if(target) {
        let dx = target.x - striker.x;
        let dy = target.y - striker.y;
        let mag = Math.hypot(dx, dy);
        // Shoot at it
        striker.vx = (dx/mag) * 20;
        striker.vy = (dy/mag) * 20;
        isTurnActive = true;
    } else {
        // Game Over - No pucks left
        alert("Game Over!");
        goToMenu();
    }
}

// --- INPUTS ---
canvas.addEventListener('touchstart', e => {
    if(gameState !== 'PLAYING' || isTurnActive) return;
    if(gameMode === 'ai' && currentPlayer === 2) return;

    e.preventDefault();
    let r = canvas.getBoundingClientRect();
    let x = e.touches[0].clientX - r.left;
    let y = e.touches[0].clientY - r.top;

    // Is player touching the striker?
    let d = Math.hypot(x - striker.x, y - striker.y);
    
    if(d < striker.r * 2) {
        inputMode = 'SLIDING';
    } else {
        inputMode = 'AIMING';
        drag.startX = x; drag.startY = y;
        drag.currX = x; drag.currY = y;
    }
}, {passive: false});

canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    if(inputMode === 'NONE') return;
    
    let r = canvas.getBoundingClientRect();
    let x = e.touches[0].clientX - r.left;
    let y = e.touches[0].clientY - r.top;

    if(inputMode === 'SLIDING') {
        striker.x = x;
        // Clamp to board
        if(striker.x < striker.r) striker.x = striker.r;
        if(striker.x > BOARD_SIZE-striker.r) striker.x = BOARD_SIZE-striker.r;
    } else if (inputMode === 'AIMING') {
        drag.currX = x;
        drag.currY = y;
    }
}, {passive: false});

canvas.addEventListener('touchend', e => {
    if(inputMode === 'AIMING') {
        let dx = drag.startX - drag.currX;
        let dy = drag.startY - drag.currY;
        let power = Math.hypot(dx, dy);
        
        // Shoot if pulled enough
        if(power > 10) {
            power = Math.min(power, 200); // Max power
            let force = power * 0.2;
            let ang = Math.atan2(dy, dx);
            striker.vx = Math.cos(ang) * force;
            striker.vy = Math.sin(ang) * force;
            isTurnActive = true;
        }
    }
    inputMode = 'NONE';
});

// --- RENDER ---
function draw() {
    ctx.clearRect(0,0,canvas.width,canvas.height);

    // Pockets
    ctx.fillStyle = '#000';
    pockets.forEach(p => {
        ctx.beginPath(); ctx.arc(p.x, p.y, BOARD_SIZE*0.06, 0, 7); ctx.fill();
    });

    // Aim Line
    if(inputMode === 'AIMING') {
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(255,255,255,0.6)';
        ctx.lineWidth = 4;
        ctx.setLineDash([5, 10]);
        ctx.moveTo(striker.x, striker.y);
        // Draw line opposite to drag
        let dx = drag.startX - drag.currX;
        let dy = drag.startY - drag.currY;
        ctx.lineTo(striker.x + dx*2, striker.y + dy*2);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    // Pieces
    [striker, ...pucks].forEach(p => {
        if(!p.active && p !== striker) return;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, 7);
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

// --- UI HELPERS ---
function updateUI() {
    document.getElementById('menu-coins').innerText = coins;
    document.getElementById('shop-coins').innerText = coins;
    let turnTxt = gameMode === 'ai' && currentPlayer === 2 ? "AI Thinking..." : "Player " + currentPlayer;
    document.getElementById('message-box').innerText = turnTxt;
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
        let isOwned = owned.includes(s.id);
        let btn = document.createElement('div');
        btn.className = `shop-item ${isOwned ? 'owned' : ''}`;
        btn.innerHTML = `
            <div style="width:30px;height:30px;border-radius:50%;background:${s.color};margin:auto;border:1px solid white"></div>
            <h3>${s.name}</h3>
            ${isOwned ? "OWNED" : "💰 " + s.price}
        `;
        btn.onclick = () => {
            if(isOwned) {
                currentSkin = s.color;
                localStorage.setItem('c_skin', s.color);
                alert("Equipped!");
            } else if(coins >= s.price) {
                coins -= s.price;
                owned.push(s.id);
                localStorage.setItem('c_owned', JSON.stringify(owned));
                localStorage.setItem('c_coins', coins);
                updateUI();
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
