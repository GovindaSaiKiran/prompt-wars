document.addEventListener('DOMContentLoaded', () => {
    // --- Navigation Logic ---
    const navItems = document.querySelectorAll('.nav-item');
    const views = document.querySelectorAll('.view');

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            // Remove active class from all nav items and views
            navItems.forEach(nav => nav.classList.remove('active'));
            views.forEach(view => view.classList.remove('active'));

            // Add active class to clicked nav item
            item.classList.add('active');

            // Show target view
            const targetId = item.getAttribute('data-target');
            document.getElementById(targetId).classList.add('active');
            
            // Scroll to top when changing views
            document.getElementById('content').scrollTop = 0;
        });
    });

    // --- Live Match Mock Data Simulation ---
    const balls = ['1', 'W', '4', '0', '6', '2', '1', '4', '1', '2'];
    const recentBallsContainer = document.getElementById('recent-balls');
    
    // Initial Render of recent balls
    function renderRecentBalls() {
        recentBallsContainer.innerHTML = '';
        balls.slice(-6).forEach(run => {
            const ballDiv = document.createElement('div');
            ballDiv.className = 'ball';
            if (run === '4') ballDiv.classList.add('boundary');
            if (run === '6') ballDiv.classList.add('six');
            if (run === 'W') ballDiv.classList.add('wicket');
            ballDiv.textContent = run;
            recentBallsContainer.appendChild(ballDiv);
        });
    }

    renderRecentBalls();

    // Simulate match progressing
    let runs = 184;
    let ballsFaced = 110; // 18.2 overs
    
    setInterval(() => {
        // Only update if we are on the live match view (optional optimization, but good for UX)
        if (!document.getElementById('live-match').classList.contains('active')) return;

        // Simulate a random ball outcome
        const possibleOutcomes = ['0', '1', '2', '4', '6', 'W'];
        const randomOutcome = possibleOutcomes[Math.floor(Math.random() * possibleOutcomes.length)];
        
        // Add to array, keep only last 10
        balls.push(randomOutcome);
        if (balls.length > 10) balls.shift();
        
        // Update runs and overs
        ballsFaced++;
        const oversFaced = Math.floor(ballsFaced / 6);
        const ballsInOver = ballsFaced % 6;
        const overString = `${oversFaced}.${ballsInOver}`;
        
        if (randomOutcome !== 'W') {
            runs += parseInt(randomOutcome);
        }

        // DOM Updates
        document.getElementById('team1-score').textContent = `${runs}/4`;
        document.getElementById('team1-overs').textContent = `(${overString})`;
        
        const target = 196;
        const runsNeeded = target - runs;
        
        if (runsNeeded > 0) {
            document.getElementById('match-equation').textContent = `RCB need ${runsNeeded} runs to reach ${target}`;
        } else {
            document.getElementById('match-equation').textContent = `RCB has reached the target!`;
        }

        renderRecentBalls();

        // Add a subtle flash effect to score
        const scoreEl = document.getElementById('team1-score');
        scoreEl.style.color = '#10b981'; // accent-green
        setTimeout(() => {
            scoreEl.style.color = '#ffffff';
        }, 500);

    }, 5000); // Update every 5 seconds for simulation

    // SOS Button Logic
    const sosBtn = document.getElementById('sos-btn');
    if(sosBtn) {
        sosBtn.addEventListener('click', () => {
            const originalText = sosBtn.innerHTML;
            sosBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Alerting Security...';
            sosBtn.style.background = '#991b1b'; // darker red
            
            setTimeout(() => {
                sosBtn.innerHTML = '<i class="fa-solid fa-check"></i> Security Dispatched';
                sosBtn.style.background = '#10b981'; // green
                sosBtn.classList.remove('pulse-danger');
                
                // Reset after 5 seconds
                setTimeout(() => {
                    sosBtn.innerHTML = originalText;
                    sosBtn.style.background = '';
                    sosBtn.classList.add('pulse-danger');
                }, 5000);
            }, 2000);
        });
    }
});
