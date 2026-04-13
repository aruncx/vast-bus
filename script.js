document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const busSelect = document.getElementById('bus-select');
    const stopSearch = document.getElementById('stop-search');
    const searchResults = document.getElementById('search-results');
    const resultsSection = document.getElementById('results-section');
    const routeTitle = document.getElementById('route-title');
    const routeBadge = document.getElementById('route-badge');
    const scheduleBody = document.getElementById('schedule-body');
    const gmap = document.getElementById('gmap');
    const mapHint = document.getElementById('map-hint');
    const mapPlaceholder = document.getElementById('map-placeholder');
    
    // Fee Search Elements
    const feeStopSearch = document.getElementById('fee-stop-search');
    const feeSearchResults = document.getElementById('fee-search-results');
    const feeDisplay = document.getElementById('fee-display');


    // College Location
    const COLLEGE_NAME = "Vidya Academy of Science and Technology, Thrissur, Kerala";

    // Initialize dropdown
    function initBusSelect() {
        busData.forEach((route, index) => {
            const option = document.createElement('option');
            option.value = index;
            option.textContent = `Bus ${route.bus_no} - ${route.route_name.replace(`BUS ROUTE NO.${route.bus_no} `, '').replace(`BUS ROUTE NO. ${route.bus_no} `, '')}`;
            busSelect.appendChild(option);
        });
    }

    // Render schedule for a selected route
    function renderSchedule(routeIndex) {
        const route = busData[routeIndex];
        if (!route) return;

        // Update headers
        routeTitle.textContent = `Bus Details: ${route.route_name}`;
        routeBadge.textContent = `Bus No: ${route.bus_no}`;

        // Clear previous
        scheduleBody.innerHTML = '';

        // Populate table
        route.stops.forEach((stop) => {
            const tr = document.createElement('tr');

            const tdName = document.createElement('td');
            tdName.textContent = stop.stop_name;

            const tdTime = document.createElement('td');
            let formattedTime = '';
            if (stop.time && stop.time !== 'nan') {
                let [hours, minutes] = stop.time.toString().split('.');
                if (!minutes) minutes = '00';
                else if (minutes.length === 1) minutes += '0'; // Handle '8.5' -> '8:50'
                hours = hours.padStart(2, '0');
                formattedTime = `${hours}:${minutes} AM`;
            }
            tdTime.textContent = formattedTime;

            tr.appendChild(tdName);
            tr.appendChild(tdTime);

            // Add click listener for map directions
            tr.addEventListener('click', () => {
                // Highlight row
                document.querySelectorAll('#schedule-body tr').forEach(row => row.classList.remove('selected'));
                tr.classList.add('selected');

                // Update map
                updateMapDirectons(stop.stop_name);
            });

            scheduleBody.appendChild(tr);
        });

        // Show results
        resultsSection.classList.remove('hidden');

        // Reset map hint
        mapHint.textContent = "Select a boarding point from the schedule to see directions to VAST.";
        gmap.src = "";
        gmap.style.display = 'none';
        if (mapPlaceholder) mapPlaceholder.style.display = 'flex';
    }

    // Update Google Map with directions iframe
    function updateMapDirectons(boardingPoint) {
        if (!boardingPoint || boardingPoint === "VAST") return;

        // Format places for the universal Google Maps Embed API using 'dir' action
        // For directions, the iframe standard format is:
        // https://www.google.com/maps/embed/v1/directions?key=YOUR_API_KEY&origin=A&destination=B
        // Since we don't have an API key, we construct a standard google maps URL and embed it, 
        // OR use the classic output=embed trick

        const origin = encodeURIComponent(`${boardingPoint}, Thrissur, Kerala`);
        const destination = encodeURIComponent(COLLEGE_NAME);

        // Classic embed URL that doesn't strictly require an API key for basic view
        const embedUrl = `https://maps.google.com/maps?saddr=${origin}&daddr=${destination}&output=embed`;

        gmap.src = embedUrl;
        gmap.style.display = 'block';
        if (mapPlaceholder) mapPlaceholder.style.display = 'none';
        mapHint.textContent = `Showing directions from ${boardingPoint} to VAST`;
    }

    // Handle Bus Selection
    busSelect.addEventListener('change', (e) => {
        renderSchedule(e.target.value);
        // Clear search input
        stopSearch.value = '';
        searchResults.classList.add('hidden');
    });

    // Handle Stop Search Autocomplete
    stopSearch.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        searchResults.innerHTML = '';

        if (query.length < 2) {
            searchResults.classList.add('hidden');
            return;
        }

        let matches = [];

        // Search through all routes and stops
        busData.forEach((route, routeIndex) => {
            route.stops.forEach((stop, stopIndex) => {
                if (stop.stop_name.toLowerCase().includes(query) && stop.stop_name !== "VAST") {
                    matches.push({
                        routeIndex,
                        stopName: stop.stop_name,
                        routeDesc: `Bus ${route.bus_no} - ${route.route_name}`
                    });
                }
            });
        });

        // Render matches
        if (matches.length > 0) {
            matches.forEach(match => {
                const li = document.createElement('li');
                li.className = 'autocomplete-item';

                // Highlight matching text
                const regex = new RegExp(`(${query})`, 'gi');
                const highlightedName = match.stopName.replace(regex, "<strong>$1</strong>");

                li.innerHTML = `
                    <div>${highlightedName}</div>
                    <span class="route-hint">${match.routeDesc}</span>
                `;

                li.addEventListener('click', () => {
                    // Select this route in dropdown
                    busSelect.value = match.routeIndex;

                    // Render schedule
                    renderSchedule(match.routeIndex);

                    // Highlight the specific stop and show map
                    setTimeout(() => {
                        const rows = scheduleBody.querySelectorAll('tr');
                        for (let row of rows) {
                            if (row.cells[0].textContent === match.stopName) {
                                row.classList.add('selected');
                                row.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                updateMapDirectons(match.stopName);
                                break;
                            }
                        }
                    }, 100);

                    // Cleanup search
                    stopSearch.value = match.stopName;
                    searchResults.classList.add('hidden');
                });

                searchResults.appendChild(li);
            });
            searchResults.classList.remove('hidden');
        } else {
            const li = document.createElement('li');
            li.className = 'autocomplete-item';
            li.textContent = 'No matching stops found';
            searchResults.appendChild(li);
            searchResults.classList.remove('hidden');
        }
    });

    // Handle Fee Stop Search Autocomplete
    feeStopSearch.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        feeSearchResults.innerHTML = '';
        feeDisplay.value = '';

        if (query.length < 2) {
            feeSearchResults.classList.add('hidden');
            return;
        }

        let matches = [];

        // Search through all routes and stops
        busData.forEach((route) => {
            route.stops.forEach((stop) => {
                if (stop.stop_name.toLowerCase().includes(query) && stop.stop_name !== "VAST") {
                    // Prevent duplicate boarding points
                    if (!matches.some(m => m.stopName === stop.stop_name)) {
                        matches.push({
                            stopName: stop.stop_name,
                            fees: stop.fees
                        });
                    }
                }
            });
        });

        // Render matches
        if (matches.length > 0) {
            matches.forEach(match => {
                const li = document.createElement('li');
                li.className = 'autocomplete-item';

                // Highlight matching text
                const regex = new RegExp(`(${query})`, 'gi');
                const highlightedName = match.stopName.replace(regex, "<strong>$1</strong>");

                li.innerHTML = `<div>${highlightedName}</div>`;

                li.addEventListener('click', () => {
                    feeStopSearch.value = match.stopName;
                    feeDisplay.value = (match.fees && match.fees !== '-') ? `${match.fees} \u20B9` : 'Fee Data Unavailable';
                    feeSearchResults.classList.add('hidden');
                });

                feeSearchResults.appendChild(li);
            });
            feeSearchResults.classList.remove('hidden');
        } else {
            const li = document.createElement('li');
            li.className = 'autocomplete-item';
            li.textContent = 'No matching stops found';
            feeSearchResults.appendChild(li);
            feeSearchResults.classList.remove('hidden');
        }
    });

    // Hide autocomplete when clicking outside
    document.addEventListener('click', (e) => {
        if (!stopSearch.contains(e.target) && !searchResults.contains(e.target)) {
            searchResults.classList.add('hidden');
        }
        if (!feeStopSearch.contains(e.target) && !feeSearchResults.contains(e.target)) {
            feeSearchResults.classList.add('hidden');
        }
    });

    // Run initialization
    initBusSelect();
});
