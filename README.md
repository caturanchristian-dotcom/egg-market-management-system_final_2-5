# Egg Market Management System

A full-stack application connecting local farmers with fresh egg lovers.

## Prerequisites

- **Node.js**: Version 18 or higher.
- **MySQL**: A running MySQL server.

## Getting Started in VS Code

1. **Clone or Download** the project to your local machine.
2. **Open the folder** in VS Code.
3. **Install Dependencies**:
   ```bash
   npm install
   ```
4. **Configure Environment Variables**:
   - Copy `.env.example` to a new file named `.env`.
   - Update the `.env` file with your MySQL credentials (`DB_HOST`, `DB_USER`, `DB_PASSWORD`, etc.).
   - Ensure the database named `eggmarket` (or whatever you set in `DB_NAME`) exists in your MySQL server.
5. **Run the Development Server**:
   ```bash
   npm run dev
   ```
6. **Open the App**:
   - The app will likely be available at [http://localhost:3000](http://localhost:3000).

## Common Issues & Fixes

### 1. `Cannot find module 'socket.io'` or `socket.io-client`
This happens if dependencies are not installed. Run `npm install` again. If it still fails, run:
```bash
npm install socket.io socket.io-client
```

### 2. `Failed to fetch` or `Session verification failed`
This usually means the backend server is not running or cannot connect to the database.
- Check your VS Code terminal for errors.
- Ensure MySQL is running and your `.env` credentials are correct.
- If you see `ECONNREFUSED`, it means Node cannot reach MySQL.

### 3. File Path Mismatches
The project expects a specific directory structure. Based on your error log, it seems you might have a folder named `frontend` but the configuration expects `src`.
- Ensure your `vite.config.ts` matches your folder names.
- By default, the project uses `src/` for React code and the root for `server.ts`.
