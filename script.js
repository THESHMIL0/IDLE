const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

// --- CONSTANTS ---
let BOARD_SIZE = 600;
const FRICTION = 0.985; // Slippery board
const WALL_BOUNCE = 0.7;
const POCKET_RADIUS_PCT = 0.07;
const STRIKER_RADIUS_PCT = 0.045;
const PUCK_RADIUS_PCT = 0.035;

// --- STATE ---
let gameState = 'MENU';
let gameMode = 'ai';
let coins = parseInt(localStorage.getItem('cm_coins')) || 100;
let currentPlayer = 1;
let scores = {1: 0, 2: 0};
let isTurnActive = false;

// Entities
let striker = { x: 0, y: 0, vx: 0, vy: 0, r: 0, color: '#fff' };
let pucks = [];
let pockets = [];

// Input
let inputMode = 'NONE'; // SLIDING, AIMING
let drag = { startX:0, startY:0, curX:0, curY:0 };

// Shop
let currentSkin = localStorage.getItem('cm_skin') || '#ffffff';
let ownedSkins = JSON.parse(localStorage.getItem('cm_owned')) || ['white'];
const skinData = [
    {id:'white', name:'Classic', color:'#ffffff', price:0},
    {id:'neon', name:'Neon Cyan', color:'#00ffff', price:200},
    {id:'gold', name:'Royal Gold', color:'#ffd700', price:500},
    {id:'ruby', name:'Ruby Red', color:'#ff0055', price:800},
    {id:'dark', name:'Stealth', color:'#111111', price:1000}
];

// --- INITIALIZATION ---
function resize() {
    let size = Math.min(window.innerWidth, window.innerHeight) * 0.98;
    BOARD_SIZE = size;
    canvas.width = size;
    canvas.height = size;
    
    let pr = BOARD_SIZE * POCKET_RADIUS_PCT;
    pockets = [
        {x: pr, y: pr}, 
        {x: size-pr, y: pr}, 
        {x: pr, y: size-pr}, 
        {x: size-pr, y: size-pr}
    ];
}
window.addEventListener('resize', resize);
resize();

function startGame(mode) {
    gameMode = mode;
    gameState = 'PLAYING';
    currentPlayer = 1;
    scores = {1:0, 2:0};
    isTurnActive = false;
    
    // Initial Setup
    striker.r = BOARD_SIZE * STRIKER_RADIUS_PCT;
    striker.color = currentSkin;
    resetStriker();
    
    // Setup Pucks (Carrom Formation)
    pucks = [];
    let cx = BOARD_SIZE/2, cy = BOARD_SIZE/2;
    let r = BOARD_SIZE * PUCK_RADIUS_PCT;
    
    // Queen (Center)
    pucks.push({x:cx, y:cy, vx:0, vy:0, r:r, color:'#ff0055', type:'queen', active:true});
    
    // Inner Circle (6 pucks)
    for(let i=0; i<6; i++) {
        let ang = (i/6) * Math.PI*2;
        pucks.push(createPuck(cx, cy, ang, r*2.1, i%2==0 ? 'white' : 'black'));
    }
    // Outer Circle (12 pucks)
    for(let i=0; i<12; i++) {
        let ang = (i/12) * Math.PI*2;
        pucks.push(createPuck(cx, cy, ang, r*4.1, i%2==0 ? 'white' : 'black'));
    }

    document.getElementById('menu').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
    updateHUD();
    loop();
}

function createPuck(cx, cy, angle, dist, type) {
    return {
        x: cx + Math.cos(angle)*dist,
        y: cy + Math.sin(angle)*dist,
        vx: 0, vy: 0,
        r: BOARD_SIZE * PUCK_RADIUS_PCT,
        color: type === 'white' ? '#f0f0f0' : '#222',
        type: type,
        active: true
    };
}

function resetStriker() {
    striker.vx = 0; striker.vy = 0;
    striker.x = BOARD_SIZE / 2;
    // Baseline Position (80% down for P1, 20% down for P2)
    striker.y = currentPlayer === 1 ? BOARD_SIZE * 0.8 : BOARD_SIZE * 0.2;
}

// --- PHYSICS ENGINE ---
function update() {
    if(gameState !== 'PLAYING') return;
    
    let moving = false;
    let entities = [striker, ...pucks].filter(p => p.active || p===striker);

    entities.forEach(p => {
        // Move
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
                if(Math.hypot(p.x-pkt.x, p.y-pkt.y) < BOARD_SIZE*0.065) {
                    p.vx = 0; p.vy = 0;
                    if(p === striker) {
                        // Foul
                        p.x = -1000; 
                        scores[currentPlayer] = Math.max(0, scores[currentPlayer] - 10);
                    } else {
                        // Scored
                        p.active = false;
                        p.x = -1000;
                        let points = p.type === 'queen' ? 50 : (p.type==='white'?20:10);
                        scores[currentPlayer] += points;
                    }
                }
            });
        }
    });

    // Collisions
    for(let i=0; i<entities.length; i++) {
        for(let j=i+1; j<entities.length; j++) {
            resolveCollision(entities[i], entities[j]);
        }
    }

    if(isTurnActive && !moving) {
        endTurn();
    }
}

function resolveCollision(p1, p2) {
    let dx = p2.x - p1.x;
    let dy = p2.y - p1.y;
    let dist = Math.hypot(dx, dy);
    let minDist = p1.r + p2.r;

    if(dist < minDist) {
        let angle = Math.atan2(dy, dx);
        let overlap = minDist - dist;
        
        // Separate
        let tx = Math.cos(angle) * overlap * 0.5;
        let ty = Math.sin(angle) * overlap * 0.5;
        p1.x -= tx; p1.y -= ty;
        p2.x += tx; p2.y += ty;

        // Bounce
        let nx = dx/dist; let ny = dy/dist;
        let kx = p1.vx - p2.vx;
        let ky = p1.vy - p2.vy;
        let p = 2 * (nx * kx + ny * ky) / 2;
        p1.vx -= p * nx; p1.vy -= p * ny;
        p2.vx += p * nx; p2.vy += p * ny;
    }
}

function endTurn() {
    isTurnActive = false;
    
    // Logic: Did I pocket a piece? If yes, keep turn (Simplified for this version)
    // For now, simple strict switching
    currentPlayer = currentPlayer === 1 ? 2 : 1;
    
    resetStriker();
    updateHUD();

    if(gameMode === 'ai' && currentPlayer === 2) {
        setTimeout(aiMove, 800);
    }
}

function aiMove() {
    // Find closest active puck
    let target = pucks.find(p => p.active);
    if(target) {
        let dx = target.x - striker.x;
        let dy = target.y - striker.y;
        let mag = Math.hypot(dx, dy);
        
        // Add some randomness/error
        let error = (Math.random() - 0.5) * 20; 
        
        striker.vx = ((dx+error)/mag) * 25;
        striker.vy = ((dy+error)/mag) * 25;
        isTurnActive = true;
    }
}

// --- INPUT HANDLING ---
canvas.addEventListener('touchstart', handleStart, {passive:false});
canvas.addEventListener('touchmove', handleMove, {passive:false});
canvas.addEventListener('touchend', handleEnd, {passive:false});

function handleStart(e) {
    if(gameState !== 'PLAYING' || isTurnActive) return;
    if(gameMode === 'ai' && currentPlayer === 2) return;
    e.preventDefault();

    let r = canvas.getBoundingClientRect();
    let x = e.touches[0].clientX - r.left;
    let y = e.touches[0].clientY - r.top;

    // Control Zones: Top 25% and Bottom 25% are for SLIDING
    let isZone = currentPlayer===1 ? y > BOARD_SIZE*0.7 : y < BOARD_SIZE*0.3;
    
    if(isZone && Math.abs(y - striker.y) < BOARD_SIZE*0.15) {
        inputMode = 'SLIDING';
        // Snap striker to finger X immediately for better feel
        striker.x = x; 
        clampStriker();
    } else {
        inputMode = 'AIMING';
        drag.startX = x; drag.startY = y;
        drag.curX = x; drag.curY = y;
    }
}

function handleMove(e) {
    if(inputMode === 'NONE') return;
    e.preventDefault();
    let r = canvas.getBoundingClientRect();
    let x = e.touches[0].clientX - r.left;
    let y = e.touches[0].clientY - r.top;

    if(inputMode === 'SLIDING') {
        striker.x = x;
        clampStriker();
    } else {
        drag.curX = x; drag.curY = y;
    }
}

function handleEnd(e) {
    if(inputMode === 'AIMING') {
        let dx = drag.startX - drag.curX;
        let dy = drag.startY - drag.curY;
        let power = Math.hypot(dx, dy);
        
        if(power > 20) { // Min drag
            power = Math.min(power, 250); // Max power
            let force = power * 0.22;
            let ang = Math.atan2(dy, dx);
            striker.vx = Math.cos(ang) * force;
            striker.vy = Math.sin(ang) * force;
            isTurnActive = true;
        }
    }
    inputMode = 'NONE';
}

function clampStriker() {
    let margin = BOARD_SIZE * 0.1; // Keep away from pockets
    if(striker.x < margin) striker.x = margin;
    if(striker.x > BOARD_SIZE - margin) striker.x = BOARD_SIZE - margin;
}

// --- RENDERING ---
function drawBoardPattern() {
    // Draw Baseline lines
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 2;
    
    // Top Line
    let y1 = BOARD_SIZE * 0.2;
    ctx.beginPath(); ctx.moveTo(BOARD_SIZE*0.1, y1); ctx.lineTo(BOARD_SIZE*0.9, y1); ctx.stroke();
    ctx.beginPath(); ctx.arc(BOARD_SIZE*0.1, y1, 5, 0, 7); ctx.stroke(); // circle end
    ctx.beginPath(); ctx.arc(BOARD_SIZE*0.9, y1, 5, 0, 7); ctx.stroke(); // circle end

    // Bottom Line
    let y2 = BOARD_SIZE * 0.8;
    ctx.beginPath(); ctx.moveTo(BOARD_SIZE*0.1, y2); ctx.lineTo(BOARD_SIZE*0.9, y2); ctx.stroke();
    ctx.beginPath(); ctx.arc(BOARD_SIZE*0.1, y2, 5, 0, 7); ctx.stroke();
    ctx.beginPath(); ctx.arc(BOARD_SIZE*0.9, y2, 5, 0, 7); ctx.stroke();

    // Center Design
    ctx.beginPath();
    ctx.arc(BOARD_SIZE/2, BOARD_SIZE/2, BOARD_SIZE*0.15, 0, 7);
    ctx.strokeStyle = '#a63c3c';
    ctx.stroke();
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    drawBoardPattern();

    // Pockets
    ctx.fillStyle = '#1a1a1a';
    pockets.forEach(p => {
        ctx.beginPath(); ctx.arc(p.x, p.y, BOARD_SIZE*0.065, 0, 7); ctx.fill();
    });

    // Aim Line
    if(inputMode === 'AIMING') {
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        ctx.lineWidth = 3;
        ctx.setLineDash([10, 10]);
        ctx.moveTo(striker.x, striker.y);
        let dx = drag.startX - drag.curX;
        let dy = drag.startY - drag.curY;
        ctx.lineTo(striker.x + dx*2, striker.y + dy*2);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    // Pucks
    [...pucks, striker].forEach(p => {
        if(!p.active && p!==striker) return;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, 7);
        ctx.fillStyle = p.color;
        ctx.fill();
        
        // Bevel effect (shine)
        ctx.beginPath();
        ctx.arc(p.x - p.r*0.2, p.y - p.r*0.2, p.r*0.3, 0, 7);
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.fill();

        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        ctx.stroke();
    });
}

function loop() {
    update();
    draw();
    requestAnimationFrame(loop);
}

// --- UI HELPERS ---
function updateHUD() {
    document.getElementById('menu-coins').innerText = coins;
    document.getElementById('shop-coins').innerText = coins;
    document.getElementById('p1-score').innerText = `P1: ${scores[1]}`;
    document.getElementById('p2-score').innerText = `P2: ${scores[2]}`;
    
    // Highlight Turn
    document.getElementById('p1-score').className = currentPlayer === 1 ? 'active-turn' : '';
    document.getElementById('p2-score').className = currentPlayer === 2 ? 'active-turn' : '';
    
    document.getElementById('message-area').innerText = 
        gameMode==='ai' && currentPlayer===2 ? "AI Thinking..." : `Player ${currentPlayer}'s Turn`;
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
    skinData.forEach(s => {
        let isOwned = ownedSkins.includes(s.id);
        let btn = document.createElement('div');
        btn.className = `shop-item ${isOwned ? 'owned' : ''}`;
        btn.innerHTML = `
            <div style="width:40px;height:40px;border-radius:50%;background:${s.color};margin:0 auto 10px;box-shadow:0 0 5px white;"></div>
            <b>${s.name}</b><br>
            ${isOwned ? "OWNED" : "💰 "+s.price}
        `;
        btn.onclick = () => {
            if(isOwned) {
                currentSkin = s.color;
                localStorage.setItem('cm_skin', s.color);
                alert("Equipped!");
            } else if(coins >= s.price) {
                coins -= s.price;
                ownedSkins.push(s.id);
                localStorage.setItem('cm_owned', JSON.stringify(ownedSkins));
                localStorage.setItem('cm_coins', coins);
                openShop(); // refresh
                updateHUD();
            }
        };
        list.appendChild(btn);
    });
}
function closeShop() {
    document.getElementById('shop').classList.add('hidden');
    document.getElementById('menu').classList.remove('hidden');
}
