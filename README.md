# 🇳🇴 Norwegian Game Stats

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

## Deployment

The recommended way to deploy this with automatic updates is using **Railway**. It connects directly to your GitHub repository and handles persistent storage (volumes) which is required for the SQLite database.

### Railway Setup (Recommended)

1.  Push your code to a **GitHub repository**.
2.  Login to [Railway.app](https://railway.app/).
3.  Click **New Project** > **Deploy from GitHub repo**.
4.  Select your repository.
5.  Railway will automatically detect the `Dockerfile` and start building.
6.  **Crucial for SQLite Persistence**:
    - Go to your service settings in Railway.
    - Click on the **Volumes** tab.
    - Click **Add Volume**.
    - Set the **Mount Path** to `/app/src/data`.
7.  Your app will be live at a `.up.railway.app` domain.

### Other Options

#### Render
1.  Connect your GitHub repository to Render.
2.  Select **Docker** as the Runtime.
3.  Add a **Disk** with mount path `/app/src/data` (requires a paid plan).

#### Heroku (Not Recommended)
Heroku uses an **ephemeral filesystem**, meaning your SQLite database will be wiped every time the app restarts. To use Heroku, you would need to switch to a managed database like Heroku Postgres.

## Automated Deployment with GitHub Actions

This repository includes a GitHub Action in `.github/workflows/deploy.yml` that ensures your code builds correctly on every push. You can also configure it to trigger a deployment to Railway.

### Setting up Railway Deployment

1.  Install the [Railway CLI](https://docs.railway.app/guides/cli) locally.
2.  Run `railway login`.
3.  Run `railway link` in your project folder to link it to your Railway project.
4.  Get your **Railway API Token**:
    - Go to your Railway Account Settings > Tokens.
    - Create a new token.
5.  In your **GitHub Repository**, go to **Settings** > **Secrets and variables** > **Actions**.
6.  Add a new secret named `RAILWAY_TOKEN` and paste your token.

Now, every time you push to the `main` branch, the GitHub Action will verify the build and trigger a deployment to Railway.

### Environmental Variables
If you want to change the port, set the `PORT` environment variable in your deployment platform's dashboard.

### Why not Netlify or Vercel?
While Netlify and Vercel are excellent for static sites, this project requires a persistent server to:
1.  Run the **background collection job** (cron).
2.  Store data in a **database**.

Render, Railway, and Heroku are all good options for this architecture.
