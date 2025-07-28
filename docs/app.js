// Configuration
const GITHUB_OWNER = 'lucaschatham';
const GITHUB_REPO = 'habitify';
const DATA_PATH = 'data';

// State
let allHabitData = {};

// Fetch all habit data from the repository
async function fetchHabitData() {
    try {
        // Get the file tree to find all JSON files
        const response = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/git/trees/main?recursive=1`);
        const tree = await response.json();
        
        // Filter for JSON files in the data directory
        const dataFiles = tree.tree.filter(file => 
            file.path.startsWith(`${DATA_PATH}/`) && 
            file.path.endsWith('.json') &&
            !file.path.endsWith('.gitkeep')
        );
        
        console.log(`Found ${dataFiles.length} data files:`, dataFiles.map(f => f.path));
        
        // Fetch each file's content
        const filePromises = dataFiles.map(async (file) => {
            const contentResponse = await fetch(file.url);
            const contentData = await contentResponse.json();
            const decodedContent = atob(contentData.content);
            const parsed = JSON.parse(decodedContent);
            console.log(`File ${file.path} has ${parsed.habits?.length || 0} habits`);
            return parsed;
        });
        
        const allData = await Promise.all(filePromises);
        console.log('Total files loaded:', allData.length);
        
        // Process data into habit-centric structure
        allData.forEach(dayData => {
            if (dayData.habits) {
                console.log(`Processing ${dayData.habits.length} habits for date ${dayData.date}`);
                dayData.habits.forEach(habit => {
                    if (!allHabitData[habit.name]) {
                        allHabitData[habit.name] = {
                            name: habit.name,
                            unit: habit.unit,
                            goal: habit.goal,
                            data: {}
                        };
                    }
                    
                    // Store data by date
                    allHabitData[habit.name].data[dayData.date] = {
                        logs: habit.logs,
                        completed: habit.logs.some(log => log.status === 'completed'),
                        value: habit.logs[0]?.value || 0,
                        status: habit.logs[0]?.status || 'none'
                    };
                });
            }
        });
        
        console.log('Total unique habits found:', Object.keys(allHabitData).length);
        console.log('Habit names:', Object.keys(allHabitData));
        
        return true;
    } catch (error) {
        console.error('Error fetching habit data:', error);
        return false;
    }
}

// Create completion heatmap for a habit
function createCompletionHeatmap(habitName, habitData, container) {
    const heatmapDiv = document.createElement('div');
    heatmapDiv.className = 'heatmap-chart';
    heatmapDiv.id = `heatmap-${habitName.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '')}`;
    container.appendChild(heatmapDiv);
    
    // Convert data to array format for D3
    const data = Object.entries(habitData.data).map(([date, info]) => ({
        date: date,
        value: info.completed ? 1 : 0,
        status: info.status
    }));
    
    // Create GitHub-style heatmap using D3
    createD3Heatmap(heatmapDiv, data, habitName);
}

// Create D3 heatmap
function createD3Heatmap(container, data, habitName) {
    const cellSize = 11;
    const cellPadding = 2;
    const monthLabelHeight = 15;
    const weekLabelWidth = 15;
    
    // Clear previous content
    d3.select(container).selectAll("*").remove();
    
    // Get the current date and one year ago
    const now = new Date();
    const yearAgo = new Date(now);
    yearAgo.setFullYear(yearAgo.getFullYear() - 1);
    
    // Calculate dimensions based on a full year
    const weeksInYear = 53;
    const width = (cellSize + cellPadding) * weeksInYear + weekLabelWidth + 20;
    const height = (cellSize + cellPadding) * 7 + monthLabelHeight + 20;
    
    const svg = d3.select(container)
        .append('svg')
        .attr('width', width)
        .attr('height', height);
    
    // GitHub's exact heatmap colors
    const colorScale = d3.scaleOrdinal()
        .domain(['none', 'completed', 'skipped', 'in_progress', 'failed'])
        .range(['#161b22', '#39d353', '#3572A5', '#0e4429', '#f85149']);
    
    // Create a map for quick date lookup
    const dateMap = new Map(data.map(d => [d.date, d]));
    
    // Generate all days for the past year
    const days = d3.timeDays(yearAgo, now);
    
    // Create month labels
    const monthLabels = d3.timeMonths(yearAgo, now);
    svg.selectAll('.month-label')
        .data(monthLabels)
        .enter()
        .append('text')
        .attr('class', 'month-label')
        .attr('x', d => {
            const weekNumber = d3.timeWeek.count(yearAgo, d);
            return weekNumber * (cellSize + cellPadding) + weekLabelWidth + 10;
        })
        .attr('y', monthLabelHeight - 5)
        .style('font-size', '10px')
        .style('fill', '#7d8590')
        .text(d => d3.timeFormat('%b')(d));
    
    // Draw cells for each day
    const cellGroups = svg.selectAll('.day-cell')
        .data(days)
        .enter()
        .append('g')
        .attr('transform', d => {
            const weekDiff = d3.timeWeek.count(yearAgo, d);
            const dayOfWeek = d.getDay();
            return `translate(${weekDiff * (cellSize + cellPadding) + weekLabelWidth + 10}, ${dayOfWeek * (cellSize + cellPadding) + monthLabelHeight + 5})`;
        });
    
    cellGroups.append('rect')
        .attr('width', cellSize)
        .attr('height', cellSize)
        .attr('rx', 2)
        .attr('fill', d => {
            const dateStr = d.toISOString().split('T')[0];
            const dayData = dateMap.get(dateStr);
            return dayData ? colorScale(dayData.status) : '#161b22';
        })
        .style('outline', 'none')
        .append('title')
        .text(d => {
            const dateStr = d.toISOString().split('T')[0];
            const dayData = dateMap.get(dateStr);
            return `${dateStr}: ${dayData ? dayData.status : 'no data'}`;
        });
    
    // Add day labels (only show Mon, Wed, Fri)
    const dayLabels = ['Sun', '', 'Tue', '', 'Thu', '', 'Sat'];
    svg.selectAll('.day-label')
        .data(dayLabels)
        .enter()
        .append('text')
        .attr('class', 'day-label')
        .attr('x', weekLabelWidth)
        .attr('y', (d, i) => i * (cellSize + cellPadding) + monthLabelHeight + 13)
        .attr('text-anchor', 'end')
        .style('font-size', '9px')
        .style('fill', '#7d8590')
        .text(d => d);
}

// Create numerical trend chart for habits with values
function createTrendChart(habitName, habitData, container) {
    // Check if habit has numerical data
    const hasNumericalData = Object.values(habitData.data).some(d => d.value > 0 && d.status !== 'skipped');
    if (!hasNumericalData) return;
    
    const chartDiv = document.createElement('div');
    chartDiv.className = 'trend-chart';
    chartDiv.innerHTML = '<h4>Progress Trend</h4>';
    container.appendChild(chartDiv);
    
    const chartContainer = document.createElement('div');
    chartContainer.id = `trend-${habitName.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '')}`;
    chartDiv.appendChild(chartContainer);
    
    // Prepare data
    const trendData = Object.entries(habitData.data)
        .filter(([date, info]) => info.value > 0)
        .map(([date, info]) => ({
            date: new Date(date),
            value: info.value
        }))
        .sort((a, b) => a.date - b.date);
    
    if (trendData.length === 0) return;
    
    // Create line chart
    createD3LineChart(chartContainer, trendData, habitData.goal, habitData.unit);
}

// Create D3 line chart
function createD3LineChart(container, data, goal, unit) {
    const margin = { top: 20, right: 60, bottom: 40, left: 60 };
    const width = 900 - margin.left - margin.right;
    const height = 200 - margin.top - margin.bottom;
    
    const svg = d3.select(container)
        .append('svg')
        .attr('width', width + margin.left + margin.right)
        .attr('height', height + margin.top + margin.bottom)
        .append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);
    
    // Scales
    const xScale = d3.scaleTime()
        .domain(d3.extent(data, d => d.date))
        .range([0, width]);
    
    const yScale = d3.scaleLinear()
        .domain([0, d3.max(data, d => Math.max(d.value, goal || d.value))])
        .nice()
        .range([height, 0]);
    
    // Line generator
    const line = d3.line()
        .x(d => xScale(d.date))
        .y(d => yScale(d.value))
        .curve(d3.curveMonotoneX);
    
    // Add axes
    svg.append('g')
        .attr('transform', `translate(0,${height})`)
        .call(d3.axisBottom(xScale).tickFormat(d3.timeFormat('%b %d')));
    
    svg.append('g')
        .call(d3.axisLeft(yScale));
    
    // Add unit label
    svg.append('text')
        .attr('transform', 'rotate(-90)')
        .attr('y', 0 - margin.left)
        .attr('x', 0 - (height / 2))
        .attr('dy', '1em')
        .style('text-anchor', 'middle')
        .style('font-size', '12px')
        .text(unit || 'Value');
    
    // Add goal line if exists
    if (goal) {
        svg.append('line')
            .attr('x1', 0)
            .attr('x2', width)
            .attr('y1', yScale(goal))
            .attr('y2', yScale(goal))
            .attr('stroke', '#28a745')
            .attr('stroke-width', 2)
            .attr('stroke-dasharray', '5,5');
        
        svg.append('text')
            .attr('x', width - 5)
            .attr('y', yScale(goal) - 5)
            .attr('text-anchor', 'end')
            .style('fill', '#28a745')
            .style('font-size', '12px')
            .text(`Goal: ${goal} ${unit}`);
    }
    
    // Add line
    svg.append('path')
        .datum(data)
        .attr('fill', 'none')
        .attr('stroke', '#0366d6')
        .attr('stroke-width', 2)
        .attr('d', line);
    
    // Add dots
    svg.selectAll('.dot')
        .data(data)
        .enter().append('circle')
        .attr('class', 'dot')
        .attr('cx', d => xScale(d.date))
        .attr('cy', d => yScale(d.value))
        .attr('r', 4)
        .attr('fill', '#0366d6')
        .append('title')
        .text(d => `${d.date.toLocaleDateString()}: ${d.value} ${unit}`);
}

// Calculate habit statistics
function calculateStats(habitData) {
    const dataArray = Object.values(habitData.data);
    const total = dataArray.length;
    const completed = dataArray.filter(d => d.completed).length;
    const streak = calculateCurrentStreak(habitData.data);
    
    return {
        total,
        completed,
        percentage: total > 0 ? Math.round((completed / total) * 100) : 0,
        streak
    };
}

// Calculate current streak
function calculateCurrentStreak(dataByDate) {
    const sortedDates = Object.keys(dataByDate).sort().reverse();
    let streak = 0;
    const today = new Date().toISOString().split('T')[0];
    
    for (const date of sortedDates) {
        if (dataByDate[date].completed) {
            streak++;
        } else if (date !== today) {
            // Only break streak if it's not today (allow for habits not done yet today)
            break;
        }
    }
    
    return streak;
}

// Render all habits
function renderHabits() {
    const container = document.getElementById('habits-container');
    container.innerHTML = '';
    
    // Sort habits by name
    const sortedHabits = Object.entries(allHabitData).sort((a, b) => a[0].localeCompare(b[0]));
    
    sortedHabits.forEach(([habitName, habitData]) => {
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
            <div class="heatmap-container"></div>
        `;
        
        container.appendChild(habitCard);
        
        // Create heatmap
        const heatmapContainer = habitCard.querySelector('.heatmap-container');
        createCompletionHeatmap(habitName, habitData, heatmapContainer);
        
        // Create trend chart if applicable
        createTrendChart(habitName, habitData, habitCard);
    });
    
    // Update last updated time
    document.getElementById('last-updated').textContent = new Date().toLocaleString();
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
        
        console.log(`Loaded ${Object.keys(allHabitData).length} habits`);
        renderHabits();
    } else {
        loading.style.display = 'none';
        error.style.display = 'block';
        error.textContent = 'No habit data found. Please run the sync first to populate data.';
    }
}

// Start the app
document.addEventListener('DOMContentLoaded', init);