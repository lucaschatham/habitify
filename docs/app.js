// Configuration
const GITHUB_OWNER = 'lucaschatham';
const GITHUB_REPO = 'habitify';
const DATA_PATH = 'data';

// State
let allHabitData = {};
let heatmapInstances = new Map();

// Fetch all habit data from the repository
async function fetchHabitData() {
    try {
        // Get the file tree to find all JSON files
        const response = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/git/trees/main?recursive=1`);
        const tree = await response.json();
        
        // Filter for JSON files in the data directory
        const dataFiles = tree.tree.filter(file => 
            file.path.startsWith(`${DATA_PATH}/`) && 
            file.path.endsWith('.json')
        );
        
        // Fetch each file's content
        const filePromises = dataFiles.map(async (file) => {
            const contentResponse = await fetch(file.url);
            const contentData = await contentResponse.json();
            const decodedContent = atob(contentData.content);
            return JSON.parse(decodedContent);
        });
        
        const allData = await Promise.all(filePromises);
        
        // Process data into habit-centric structure
        allData.forEach(dayData => {
            if (dayData.habits) {
                dayData.habits.forEach(habit => {
                    if (!allHabitData[habit.name]) {
                        allHabitData[habit.name] = {
                            name: habit.name,
                            unit: habit.unit,
                            goal: habit.goal,
                            data: []
                        };
                    }
                    
                    // Add this day's data
                    allHabitData[habit.name].data.push({
                        date: dayData.date,
                        logs: habit.logs,
                        completed: habit.logs.some(log => log.status === 'completed')
                    });
                });
            }
        });
        
        return true;
    } catch (error) {
        console.error('Error fetching habit data:', error);
        return false;
    }
}

// Create heatmap for a habit
function createHeatmap(habitName, habitData, container) {
    // Prepare data for cal-heatmap
    const heatmapData = {};
    
    habitData.data.forEach(day => {
        const timestamp = new Date(day.date).getTime() / 1000; // Unix timestamp
        heatmapData[timestamp] = day.completed ? 1 : 0;
    });
    
    // Create heatmap instance
    const cal = new CalHeatmap();
    cal.paint({
        itemSelector: container,
        data: {
            source: heatmapData,
            type: 'json',
            x: 'date',
            y: 'value'
        },
        range: 12, // Show 12 months
        domain: {
            type: 'month',
            gutter: 10,
            label: {
                text: 'MMM YYYY',
                position: 'top'
            }
        },
        subDomain: {
            type: 'day',
            gutter: 2,
            width: 11,
            height: 11,
            radius: 2
        },
        scale: {
            color: {
                type: 'threshold',
                range: ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39'],
                domain: [0, 1]
            }
        },
        date: {
            start: new Date(new Date().setMonth(new Date().getMonth() - 11))
        }
    });
    
    // Add tooltips
    cal.on('click', function(event, timestamp, value) {
        const date = new Date(timestamp * 1000).toLocaleDateString();
        const status = value ? 'Completed' : 'Not completed';
        console.log(`${habitName} on ${date}: ${status}`);
    });
    
    heatmapInstances.set(habitName, cal);
}

// Calculate habit statistics
function calculateStats(habitData) {
    const total = habitData.data.length;
    const completed = habitData.data.filter(d => d.completed).length;
    const streak = calculateCurrentStreak(habitData.data);
    
    return {
        total,
        completed,
        percentage: total > 0 ? Math.round((completed / total) * 100) : 0,
        streak
    };
}

// Calculate current streak
function calculateCurrentStreak(data) {
    // Sort by date descending
    const sorted = [...data].sort((a, b) => 
        new Date(b.date).getTime() - new Date(a.date).getTime()
    );
    
    let streak = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    for (let i = 0; i < sorted.length; i++) {
        const logDate = new Date(sorted[i].date);
        logDate.setHours(0, 0, 0, 0);
        
        // Check if this is today or yesterday (allowing for one day gap)
        const daysDiff = Math.floor((today - logDate) / (1000 * 60 * 60 * 24));
        
        if (daysDiff <= i + 1 && sorted[i].completed) {
            streak++;
        } else {
            break;
        }
    }
    
    return streak;
}

// Render all habits
function renderHabits() {
    const container = document.getElementById('habits-container');
    container.innerHTML = '';
    
    Object.entries(allHabitData).forEach(([habitName, habitData]) => {
        const stats = calculateStats(habitData);
        
        const habitCard = document.createElement('div');
        habitCard.className = 'habit-card';
        
        habitCard.innerHTML = `
            <div class="habit-header">
                <h2 class="habit-title">${habitName}</h2>
            </div>
            <div class="habit-stats">
                <div class="stat-item">
                    <span class="stat-label">Current Streak</span>
                    <span class="stat-value">${stats.streak} days</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Completion Rate</span>
                    <span class="stat-value">${stats.percentage}%</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Total Logged</span>
                    <span class="stat-value">${stats.completed}/${stats.total}</span>
                </div>
            </div>
            <div class="heatmap-container" id="heatmap-${habitName.replace(/\s+/g, '-')}"></div>
            <div class="legend">
                <span>Less</span>
                <div class="legend-item">
                    <div class="legend-box" style="background: #ebedf0;"></div>
                </div>
                <div class="legend-item">
                    <div class="legend-box" style="background: #9be9a8;"></div>
                </div>
                <div class="legend-item">
                    <div class="legend-box" style="background: #40c463;"></div>
                </div>
                <div class="legend-item">
                    <div class="legend-box" style="background: #30a14e;"></div>
                </div>
                <div class="legend-item">
                    <div class="legend-box" style="background: #216e39;"></div>
                </div>
                <span>More</span>
            </div>
        `;
        
        container.appendChild(habitCard);
        
        // Create heatmap
        const heatmapContainer = document.getElementById(`heatmap-${habitName.replace(/\s+/g, '-')}`);
        createHeatmap(habitName, habitData, heatmapContainer);
    });
}

// Initialize the app
async function init() {
    const loading = document.getElementById('loading');
    const error = document.getElementById('error');
    const container = document.getElementById('habits-container');
    
    const success = await fetchHabitData();
    
    if (success && Object.keys(allHabitData).length > 0) {
        loading.style.display = 'none';
        container.style.display = 'block';
        renderHabits();
        
        // Update last updated time
        document.getElementById('last-updated').textContent = new Date().toLocaleString();
    } else {
        loading.style.display = 'none';
        error.style.display = 'block';
        error.textContent = 'No habit data found. Please run the sync first to populate data.';
    }
}

// Start the app
document.addEventListener('DOMContentLoaded', init);