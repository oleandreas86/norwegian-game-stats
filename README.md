# Norwegian Game Stats

A simple website that tracks player counts for Norwegian video games on Steam, inspired by SteamDB.

## How it works

1.  **Data Collection**: The backend uses the Steam Web API (`ISteamUserStats/GetNumberOfCurrentPlayers`) to fetch real-time player counts for a predefined list of Norwegian games.
2.  **Storage**: Historical data is stored in a local SQLite database.
3.  **Visualization**: A frontend built with Chart.js displays current player counts and historical trends.

## Setup

1.  Install dependencies:
    ```bash
    npm install
    ```
2.  Start the server and collector:
    ```bash
    npm start
    ```
    The server will start at `http://localhost:3000`. It will also automatically start a background job that collects data every 10 minutes.

## Configuration

You can add or remove games in `src/config.js`.

```javascript
module.exports = {
  games: [
    { id: 440900, name: "Conan Exiles", developer: "Funcom" },
    // Add more here
  ],
  databasePath: "./src/data/stats.db",
  collectionInterval: "*/10 * * * *" // Cron format
};
```

## Tech Stack

-   **Backend**: Node.js, Express
-   **Database**: SQLite
-   **Frontend**: HTML/CSS/JS, Chart.js
-   **Scheduler**: node-cron
-   **API Client**: Axios
