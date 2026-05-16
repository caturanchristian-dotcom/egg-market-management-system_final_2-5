// Import necessary modules for the backend server
import express from 'express';
import { createServer as createViteServer } from 'vite';
import db from './db.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import { OAuth2Client } from 'google-auth-library';
import { google } from 'googleapis';
import multer from 'multer';
import fs from 'fs';
import cors from 'cors';

// Load environment variables from .env file
dotenv.config();

// Define directory name for ES modules
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Secret for signing cookies
const SESSION_SECRET = process.env.SESSION_SECRET || 'eggmarket_default_secret';

// Configure Google OAuth client
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const APP_URL = process.env.APP_URL;

/**
 * Sends a notification email using the Gmail API
 */
async function sendGmailNotification(toEmail: string, subject: string, body: string) {
  const GMAIL_REFRESH_TOKEN = process.env.GMAIL_REFRESH_TOKEN;
  const GMAIL_USER = process.env.GMAIL_USER; // The email address of the sender
  
  if (!GMAIL_REFRESH_TOKEN || !GMAIL_USER || !GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    console.warn('[Gmail API] Missing credentials (GMAIL_USER or GMAIL_REFRESH_TOKEN). Email notification skipped.');
    return;
  }

  try {
    const oAuth2Client = new OAuth2Client(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
    oAuth2Client.setCredentials({ refresh_token: GMAIL_REFRESH_TOKEN });

    const gmail = google.gmail({ version: 'v1', auth: oAuth2Client });

    const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`;
    const messageParts = [
      `From: EggMarket <${GMAIL_USER}>`,
      `To: ${toEmail}`,
      'Content-Type: text/html; charset=utf-8',
      'MIME-Version: 1.0',
      `Subject: ${utf8Subject}`,
      '',
      body,
    ];
    const message = messageParts.join('\n');

    // The body needs to be base64url encoded.
    const encodedMessage = Buffer.from(message)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage,
      },
    });
    console.log(`[Gmail API] Email sent successfully to ${toEmail}`);
  } catch (error) {
    console.error('[Gmail API] Error sending email:', error);
  }
}

const oauth2Client = new OAuth2Client(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);

/**
 * Helper to get base URL for redirects
 */
  const getBaseUrl = (req: express.Request) => {
    // 1. Explicitly configured URL takes priority
    if (APP_URL) {
      return APP_URL.endsWith('/') ? APP_URL.slice(0, -1) : APP_URL;
    }
    
    // 2. Render.com external URL detection
    if (process.env.RENDER_EXTERNAL_URL) {
      const renderUrl = process.env.RENDER_EXTERNAL_URL;
      return renderUrl.endsWith('/') ? renderUrl.slice(0, -1) : renderUrl;
    }

    // 3. Auto-detect from request headers
    const host = req.get('host') || '';
    // Use https for all non-localhost environments to avoid redirect_uri_mismatch on secure proxies
    const isLocal = host.includes('localhost') || host.includes('127.0.0.1');
    const protocol = isLocal ? req.protocol : (req.headers['x-forwarded-proto'] || 'https');
    
    return `${protocol}://${host}`;
  };

/**
 * Main server startup function
 * Initializes database tables, seeds initial data, and sets up express middleware/routes
 */
async function startServer() {
  console.log('Starting application server...');
  
  // Test database connection before proceeding
  try {
    console.log('Connecting to database...');
    const connectionTest = db.query('SELECT 1');
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Database connection timed out after 10 seconds')), 10000));
    
    await Promise.race([connectionTest, timeout]);
    console.log('Database connection successful.');
  } catch (err) {
    console.error('CRITICAL WARNING: Database connection failed or timed out during startup!');
    console.error('Error details:', err);
    console.log('Proceeding with server startup anyway (health checks will be available)...');
  }

  const runMigrations = async () => {
    try {
      // Initialize Core Database Tables
      await db.exec(`
    -- User profiles and account information
    CREATE TABLE IF NOT EXISTS users (
      id INT PRIMARY KEY AUTO_INCREMENT,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      role ENUM('admin', 'farmer', 'customer') NOT NULL,
      status VARCHAR(50) DEFAULT 'approved',
      phone VARCHAR(50),
      address TEXT,
      purok VARCHAR(255),
      latitude DOUBLE,
      longitude DOUBLE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Product categories (e.g., Chicken Eggs, Duck Eggs)
    CREATE TABLE IF NOT EXISTS categories (
      id INT PRIMARY KEY AUTO_INCREMENT,
      name VARCHAR(255) UNIQUE NOT NULL
    );

    -- Products listed by farmers
    CREATE TABLE IF NOT EXISTS products (
      id INT PRIMARY KEY AUTO_INCREMENT,
      farmer_id INT NOT NULL,
      name VARCHAR(255) NOT NULL,
      egg_type VARCHAR(255),
      description TEXT,
      price DECIMAL(10,2) NOT NULL,
      price_per_tray DECIMAL(10,2),
      price_per_dozen DECIMAL(10,2),
      price_small DECIMAL(10,2),
      price_medium DECIMAL(10,2),
      price_large DECIMAL(10,2),
      stock INT NOT NULL,
      stock_tray INT DEFAULT 0,
      stock_dozen INT DEFAULT 0,
      stock_small INT DEFAULT 0,
      stock_medium INT DEFAULT 0,
      stock_large INT DEFAULT 0,
      price_xlarge DECIMAL(10,2) DEFAULT 0,
      stock_xlarge INT DEFAULT 0,
      price_jumbo DECIMAL(10,2) DEFAULT 0,
      stock_jumbo INT DEFAULT 0,
      category_id INT NOT NULL,
      image_url LONGTEXT,
      is_deleted TINYINT(1) DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX (farmer_id),
      INDEX (category_id),
      FOREIGN KEY (farmer_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (category_id) REFERENCES categories(id)
    );

    -- Dynamic site settings stored as key-value pairs
    CREATE TABLE IF NOT EXISTS settings (
      \`key\` VARCHAR(255) PRIMARY KEY,
      value TEXT NOT NULL
    );

    -- Default site settings
    INSERT IGNORE INTO settings (\`key\`, value) VALUES ('contact_address', 'canipaan hinunangan Egg Valley');
    INSERT IGNORE INTO settings (\`key\`, value) VALUES ('contact_phone', '09350347461');
    INSERT IGNORE INTO settings (\`key\`, value) VALUES ('contact_email', 'caturanchristian@gmail.com');
    INSERT IGNORE INTO settings (\`key\`, value) VALUES ('site_name', 'EggMarket');
    INSERT IGNORE INTO settings (\`key\`, value) VALUES ('site_description', 'Connecting local farmers with fresh egg lovers. Our mission is to provide the freshest eggs while supporting local agriculture.');
    INSERT IGNORE INTO settings (\`key\`, value) VALUES ('facebook_url', 'https://facebook.com/eggmarket');
  `);

  // Migration: Ensure latitude and longitude columns exist if they were added later
  try {
    const columns = await db.query('SHOW COLUMNS FROM users');
    const columnNames = columns.map((c: any) => (c.Field || c.field || c.Column_name || ''));
    if (!columnNames.includes('latitude')) {
      console.log('Migration: Adding latitude to users table...');
      await db.execute('ALTER TABLE users ADD COLUMN latitude DOUBLE');
    }
    if (!columnNames.includes('longitude')) {
      console.log('Migration: Adding longitude to users table...');
      await db.execute('ALTER TABLE users ADD COLUMN longitude DOUBLE');
    }

    if (!columnNames.includes('reset_token')) {
      console.log('Migration: Adding reset_token to users table...');
      await db.execute('ALTER TABLE users ADD COLUMN reset_token VARCHAR(255)');
      await db.execute('ALTER TABLE users ADD COLUMN reset_token_expires DATETIME');
    }
    console.log('Migration: User table location columns verified.');
  } catch (err) {
    console.error('Migration check failed or columns already exist:', err);
  }

  // Migration: Add verification columns to users table
  try {
    const columns = await db.query('SHOW COLUMNS FROM users');
    const columnNames = columns.map((c: any) => (c.Field || c.field || c.Column_name || ''));
    
    if (!columnNames.includes('verification_status')) {
      console.log('Migration: Adding verification_status to users table...');
      await db.execute("ALTER TABLE users ADD COLUMN verification_status ENUM('unverified', 'pending', 'verified', 'rejected') DEFAULT 'unverified'");
    }
    
    if (!columnNames.includes('created_at')) {
      console.log('Migration: Adding created_at to users table...');
      await db.execute("ALTER TABLE users ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP");
    }
    
    if (!columnNames.includes('verification_document')) {
      console.log('Migration: Adding verification_document to users table...');
      await db.execute('ALTER TABLE users ADD COLUMN verification_document TEXT');
    }

    // Migration: Add created_at to products table
    const productColumns = await db.query('SHOW COLUMNS FROM products');
    const productColumnNames = productColumns.map((c: any) => (c.Field || c.field || c.Column_name || ''));
    if (!productColumnNames.includes('price_small')) {
      console.log('Migration: Adding egg size columns to products table...');
      await db.execute('ALTER TABLE products ADD COLUMN price_small DECIMAL(10,2) DEFAULT 0');
      await db.execute('ALTER TABLE products ADD COLUMN price_medium DECIMAL(10,2) DEFAULT 0');
      await db.execute('ALTER TABLE products ADD COLUMN price_large DECIMAL(10,2) DEFAULT 0');
      await db.execute('ALTER TABLE products ADD COLUMN stock_small INT DEFAULT 0');
      await db.execute('ALTER TABLE products ADD COLUMN stock_medium INT DEFAULT 0');
      await db.execute('ALTER TABLE products ADD COLUMN stock_large INT DEFAULT 0');
    }

    if (!productColumnNames.includes('price_xlarge')) {
      console.log('Migration: Adding extra large size columns to products table...');
      await db.execute('ALTER TABLE products ADD COLUMN price_xlarge DECIMAL(10,2) DEFAULT 0');
      await db.execute('ALTER TABLE products ADD COLUMN stock_xlarge INT DEFAULT 0');
    }

    if (!productColumnNames.includes('price_jumbo')) {
      console.log('Migration: Adding jumbo size columns to products table...');
      await db.execute('ALTER TABLE products ADD COLUMN price_jumbo DECIMAL(10,2) DEFAULT 0');
      await db.execute('ALTER TABLE products ADD COLUMN stock_jumbo INT DEFAULT 0');
    }

    // Migration: Upgrade image_url to LONGTEXT
    await db.execute('ALTER TABLE products MODIFY COLUMN image_url LONGTEXT');
    
    if (!productColumnNames.includes('created_at')) {
      console.log('Migration: Adding created_at to products table...');
      await db.execute("ALTER TABLE products ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP");
    }

    // Migration: Add egg_size to order_items
    const orderItemColumns = await db.query('SHOW COLUMNS FROM order_items');
    const orderItemColumnNames = orderItemColumns.map((c: any) => (c.Field || c.field || c.Column_name || ''));
    if (!orderItemColumnNames.includes('egg_size')) {
      console.log('Migration: Adding egg_size to order_items table...');
      await db.execute('ALTER TABLE order_items ADD COLUMN egg_size VARCHAR(50)');
    }

    console.log('Migration: Database schema verified.');
  } catch (err) {
    console.error('Migration check for verification columns failed:', err);
  }

  // Initialize Transactional and Interaction Tables
  await db.exec(`
    -- Customer orders
    CREATE TABLE IF NOT EXISTS orders (
      id INT PRIMARY KEY AUTO_INCREMENT,
      customer_id INT NOT NULL,
      total_amount DECIMAL(10,2) NOT NULL,
      status ENUM('pending', 'processing', 'on the way', 'delivered', 'cancelled') DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX (customer_id),
      FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- Individual items within an order
    CREATE TABLE IF NOT EXISTS order_items (
      id INT PRIMARY KEY AUTO_INCREMENT,
      order_id INT NOT NULL,
      product_id INT NOT NULL,
      quantity INT NOT NULL,
      unit VARCHAR(50) DEFAULT 'unit',
      price DECIMAL(10,2) NOT NULL,
      egg_type VARCHAR(255),
      egg_size VARCHAR(50),
      price_per_tray DECIMAL(10,2),
      price_per_dozen DECIMAL(10,2),
      INDEX (order_id),
      INDEX (product_id),
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id)
    );

    -- User notifications
    CREATE TABLE IF NOT EXISTS notifications (
      id INT PRIMARY KEY AUTO_INCREMENT,
      user_id INT NOT NULL,
      message TEXT NOT NULL,
      is_read TINYINT(1) DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX (user_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- Direct messages between users
    CREATE TABLE IF NOT EXISTS messages (
      id INT PRIMARY KEY AUTO_INCREMENT,
      sender_id INT NOT NULL,
      receiver_id INT NOT NULL,
      content TEXT NOT NULL,
      is_read TINYINT(1) DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX (sender_id),
      INDEX (receiver_id),
      FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- Reviews for farmers Left by customers
    CREATE TABLE IF NOT EXISTS reviews (
      id INT PRIMARY KEY AUTO_INCREMENT,
      customer_id INT NOT NULL,
      farmer_id INT NOT NULL,
      order_id INT NOT NULL,
      rating INT NOT NULL CHECK(rating >= 1 AND rating <= 5),
      comment TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX (customer_id),
      INDEX (farmer_id),
      INDEX (order_id),
      FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (farmer_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    );
  `);

  // Ensure 'General' category exists as a fallback
  const categoriesCountResult = await db.query('SELECT COUNT(*) as count FROM categories');
  const categoryCount = (categoriesCountResult[0] as any).count;
  if (categoryCount === 0) {
    await db.execute('INSERT INTO categories (name) VALUES (?)', ['General']);
  }

  // Seed initial sample data if the users table is completely empty
  const usersCountResult = await db.query('SELECT COUNT(*) as count FROM users');
  const userCount = (usersCountResult[0] as any).count;
  if (userCount === 0) {
    // Add default users (Admin, Farmers, Customer)
    await db.execute('INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)', ['Admin User', 'admin@eggmarket.com', 'admin123', 'admin']);
    
    // Add standard egg categories
    await db.execute('INSERT IGNORE INTO categories (name) VALUES (?)', ['Chicken Eggs']);
    await db.execute('INSERT IGNORE INTO categories (name) VALUES (?)', ['Duck Eggs']);
    await db.execute('INSERT IGNORE INTO categories (name) VALUES (?)', ['Quail Eggs']);
    await db.execute('INSERT IGNORE INTO categories (name) VALUES (?)', ['Organic Eggs']);

    const chickenCategory = await db.queryOne('SELECT id FROM categories WHERE name = ?', ['Chicken Eggs']);
    const organicCategory = await db.queryOne('SELECT id FROM categories WHERE name = ?', ['Organic Eggs']);
  }
} catch (err) {
  console.error('Migration failed:', err);
}
};

  // Initialize Express App
  const app = express();
  
  // Enable CORS for all routes (important for iframe environments)
  app.use(cors());
  
  // Add a global request logger (quiet version)
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      // Only log errors or slow requests to avoid noise
      if (res.statusCode >= 400 || duration > 500) {
        console.log(`[HTTP] ${req.method} ${req.url} ${res.statusCode} - ${duration}ms`);
      }
    });
    next();
  });

  app.set('trust proxy', true);
  const httpServer = createServer(app);
  let io: Server;
  
  try {
    io = new Server(httpServer, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      }
    });
    console.log('Socket.io initialized successfully');
  } catch (err) {
    console.error('Failed to initialize Socket.io:', err);
  }

  // Store active socket connections by user ID
  const userSockets = new Map<string, string>();

  if (io) {
    io.on('connection', (socket) => {
      socket.on('identify', (userId) => {
        userSockets.set(userId.toString(), socket.id);
      });

      socket.on('disconnect', () => {
        // Cleanup
        for (const [userId, socketId] of userSockets.entries()) {
          if (socketId === socket.id) {
            userSockets.delete(userId);
            break;
          }
        }
      });
    });
  }

  // Helper to send real-time notification
  const sendRealTimeNotification = (userId: number, message: string, data?: any) => {
    if (!io) return;
    const socketId = userSockets.get(userId.toString());
    if (socketId) {
      io.to(socketId).emit('notification', { message, ...data });
    }
  };
  
  // Ensure uploads directory exists
  const uploadsDir = path.join(__dirname, 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  // Add a health check early to verify server is reachable
  app.get('/api/health', (req, res) => {
    console.log('[DEBUG] Health check hit');
    res.json({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  });

  app.get('/ping', (req, res) => {
    console.log('[DEBUG] Ping hit');
    res.send('pong');
  });

  app.get('/api/debug-status', (req, res) => {
    res.json({
      authenticated: !!req.signedCookies.user_id,
      env: process.env.NODE_ENV || 'development',
      dbConnected: true, // We reached here
      timestamp: new Date().toISOString()
    });
  });

  // Multer setup for handling file uploads
  const storage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, uploadsDir);
    },
    filename: function (req, file, cb) {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
  });

  const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  });

  // Set payload limits for handling larger objects like base64 images
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ limit: '10mb', extended: true }));
  // Use signed cookies for session management
  app.use(cookieParser(SESSION_SECRET));
  // Serve uploaded files as static assets
  app.use('/uploads', express.static(uploadsDir));

  // --- API Authentication Routes ---

  // Helper to wrap async routes and catch errors to prevent HTML error responses
  const asyncHandler = (fn: Function) => (req: express.Request, res: express.Response, next: express.NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch((err) => {
      console.error(`[API ERROR] ${req.method} ${req.url}:`, err);
      res.status(500).json({ 
        error: 'Internal Server Error', 
        message: err.message,
        path: req.url
      });
    });
  };

  /**
   * GET /api/auth/me
   * Returns current authenticated user's information based on the signed cookie
   */
  app.get('/api/auth/me', asyncHandler(async (req, res) => {
    const userId = req.signedCookies.user_id;
    if (userId) {
      const user = await db.queryOne('SELECT id, name, email, role, status, phone, address, purok, latitude, longitude, verification_status, verification_document FROM users WHERE id = ?', [userId]);
      if (user) {
        return res.json(user);
      }
    }
    res.status(401).json({ error: 'Not authenticated' });
  }));

  /**
   * POST /api/auth/login
   * Authenticates a user with email and password and sets a session cookie
   */
  app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    const user = await db.queryOne('SELECT * FROM users WHERE email = ? AND password = ?', [email, password]);
    if (user) {
      const isLocal = req.hostname === 'localhost';
      
      // Set secure cookie for 30 days
      res.cookie('user_id', user.id, { 
        httpOnly: true, 
        signed: true, 
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        sameSite: (isLocal && !req.secure) ? 'lax' : 'none',
        secure: isLocal ? req.secure : true
      });
      const { password: _, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } else {
      res.status(401).json({ error: 'Invalid credentials' });
    }
  });

  /**
   * POST /api/auth/register
   * Registers a new user and automatically logs them in
   */
  app.post('/api/auth/register', async (req, res) => {
    const { name, email, password, role, phone, address, purok, latitude, longitude } = req.body;
    
    // Validate phone number length (custom requirement)
    if (phone && phone.length !== 11) {
      return res.status(400).json({ error: 'Phone number must be exactly 11 digits' });
    }

    try {
      // Insert new user record into database
      // Farmers require admin approval, other roles are approved by default
      const initialStatus = role === 'farmer' ? 'pending' : 'approved';
      const result = await db.execute(
        'INSERT INTO users (name, email, password, role, status, phone, address, purok, latitude, longitude) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', 
        [name, email, password, role, initialStatus, phone || null, address || null, purok || null, latitude ?? null, longitude ?? null]
      );
      const user = await db.queryOne('SELECT * FROM users WHERE id = ?', [(result as any).insertId]);
      
      const isLocal = req.hostname === 'localhost';

      // Auto-login: Set session cookie for the new user
      res.cookie('user_id', user.id, { 
        httpOnly: true, 
        signed: true, 
        maxAge: 30 * 24 * 60 * 60 * 1000, 
        sameSite: (isLocal && !req.secure) ? 'lax' : 'none',
        secure: isLocal ? req.secure : true
      });

      // Return user data without sensitive password field
      const { password: _, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (err: any) {
      console.error('Registration error:', err);
      // Specific check for MySQL duplicate entry error code
      if (err.code === 'ER_DUP_ENTRY') {
        return res.status(400).json({ error: 'Email already exists' });
      }
      res.status(500).json({ error: `Registration failed: ${err.message}` });
    }
  });

  /**
   * POST /api/auth/logout
   * Clears the user's authentication cookie
   */
  app.post('/api/auth/logout', (req, res) => {
    const isLocal = req.hostname === 'localhost';

    res.clearCookie('user_id', {
      httpOnly: true,
      signed: true,
      sameSite: (isLocal && !req.secure) ? 'lax' : 'none',
      secure: isLocal ? req.secure : true
    });
    res.json({ success: true });
  });

  /**
   * POST /api/auth/forgot-password
   * Generates a reset token and sends it via email (or returns it in response for dev)
   */
  app.post('/api/auth/forgot-password', asyncHandler(async (req, res) => {
    const { email } = req.body;
    const user = await db.queryOne('SELECT id, name, email FROM users WHERE email = ?', [email]);
    
    if (!user) {
      // For security, don't reveal if user exists, but here we want to be helpful
      return res.status(404).json({ error: 'No account found with that email address.' });
    }

    // Generate 6-digit numeric token for simplicity in mobile/web
    const token = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 3600000); // 1 hour

    await db.execute('UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE id = ?', 
      [token, expires, user.id]);

    // Try to send email
    const subject = 'Password Reset Token - EggMarket';
    const body = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e1e8ed; border-radius: 12px;">
        <h2 style="color: #059669;">Password Reset Request</h2>
        <p>Hello ${user.name},</p>
        <p>We received a request to reset your password. Use the code below to proceed:</p>
        <div style="background: #f0fdf4; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #059669; border-radius: 8px; margin: 20px 0;">
          ${token}
        </div>
        <p>This code will expire in 1 hour.</p>
        <p>If you didn't request this, you can safely ignore this email.</p>
        <hr style="border: none; border-top: 1px solid #e1e8ed; margin: 20px 0;" />
        <p style="color: #9ca3af; font-size: 12px; text-align: center;">EggMarket Egg Valley System</p>
      </div>
    `;
    
    await sendGmailNotification(user.email, subject, body);

    res.json({ 
      success: true, 
      message: 'Reset token sent to your email.',
      // In development/preview environment where GMAIL might not be configured, 
      // we return the token so the user can actually use the feature
      debugToken: process.env.NODE_ENV !== 'production' ? token : undefined 
    });
  }));

  /**
   * POST /api/auth/reset-password
   * Validates token and updates password
   */
  app.post('/api/auth/reset-password', asyncHandler(async (req, res) => {
    const { email, token, newPassword } = req.body;
    
    const user = await db.queryOne('SELECT id FROM users WHERE email = ? AND reset_token = ? AND reset_token_expires > NOW()', 
      [email, token]);

    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired reset token.' });
    }

    await db.execute('UPDATE users SET password = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?', 
      [newPassword, user.id]);

    res.json({ success: true, message: 'Password has been reset successfully.' });
  }));

  // --- Google OAuth Routes ---

  /**
   * GET /api/auth/google/url
   * Generates and returns the Google login URL for the frontend
   */
  app.get('/api/auth/google/url', (req, res) => {
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      return res.status(500).json({ error: 'Google OAuth is not configured' });
    }

    const baseUrl = getBaseUrl(req);
    const redirectUri = `${baseUrl}/api/auth/google/callback`;
    console.log(`[OAuth] Generating Google Auth URL. Base: ${baseUrl}, Redirect: ${redirectUri}`);
    
    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'select_account',
      scope: ['https://www.googleapis.com/auth/userinfo.profile', 'https://www.googleapis.com/auth/userinfo.email'],
      redirect_uri: redirectUri,
    });
    res.json({ url });
  });

  /**
   * GET /api/auth/google/callback
   * Handles the redirect from Google, verifies the token, and creates/logs in the user
   */
  app.get('/api/auth/google/callback', async (req, res) => {
    const { code } = req.query;
    if (!code) {
      return res.status(400).send('No code provided');
    }

    try {
      const baseUrl = getBaseUrl(req);
      const redirectUri = `${baseUrl}/api/auth/google/callback`;
      console.log(`[OAuth] Handling callback. Base: ${baseUrl}, Redirect: ${redirectUri}`);
      
      // Exchange authorization code for tokens
      const { tokens } = await oauth2Client.getToken({
        code: code as string,
        redirect_uri: redirectUri,
      });
      oauth2Client.setCredentials(tokens);

      // Verify the ID token and get user info
      const ticket = await oauth2Client.verifyIdToken({
        idToken: tokens.id_token!,
        audience: GOOGLE_CLIENT_ID,
      });
      const payload = ticket.getPayload();

      if (!payload || !payload.email) {
        return res.status(400).send('Invalid Google token');
      }

      const { email, name, picture } = payload;

      // Find or Create user in local database
      let user = await db.queryOne('SELECT * FROM users WHERE email = ?', [email]);

      if (!user) {
        const result = await db.execute('INSERT INTO users (name, email, password, role, status) VALUES (?, ?, ?, ?, ?)',
          [name || 'Google User', email, Math.random().toString(36).slice(-10), 'customer', 'approved']);
        user = await db.queryOne('SELECT * FROM users WHERE id = ?', [(result as any).insertId]);
      }

      const isLocal = req.hostname === 'localhost';

      // Set session cookie
      res.cookie('user_id', user.id, { 
        httpOnly: true, 
        signed: true, 
        maxAge: 30 * 24 * 60 * 60 * 1000,
        sameSite: (isLocal && !req.secure) ? 'lax' : 'none',
        secure: isLocal ? req.secure : true
      });

      // Return a script to notify the opener window (popup) and close itself
      res.send(`
        <html>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
                window.close();
              } else {
                window.location.href = '/';
              }
            </script>
            <p>Authentication successful. This window should close automatically.</p>
          </body>
        </html>
      `);
    } catch (err) {
      console.error('Google OAuth error:', err);
      res.status(500).send('Authentication failed');
    }
  });

  // --- Product Management Routes ---

  /**
   * GET /api/products
   * Retrieves all active products with category and farmer information, plus ratings
   */
  app.get('/api/products', async (req, res) => {
    const start = Date.now();
    try {
      const products = await db.query(`
        SELECT p.*, c.name as category_name, u.name as farmer_name,
               u.phone as farmer_phone, u.address as farmer_address, u.purok as farmer_purok,
               u.latitude as farmer_latitude, u.longitude as farmer_longitude,
               r.avg_rating as average_rating,
               r.count_rating as review_count,
               COALESCE(sales.total_sold, 0) as total_sold
        FROM products p 
        JOIN categories c ON p.category_id = c.id 
        JOIN users u ON p.farmer_id = u.id
        LEFT JOIN (
          SELECT farmer_id, AVG(rating) as avg_rating, COUNT(*) as count_rating 
          FROM reviews GROUP BY farmer_id
        ) r ON p.farmer_id = r.farmer_id
        LEFT JOIN (
          SELECT product_id, SUM(quantity) as total_sold 
          FROM order_items GROUP BY product_id
        ) sales ON p.id = sales.product_id
        WHERE p.is_deleted = 0
        ORDER BY p.created_at DESC
        LIMIT 100
      `);
      const duration = Date.now() - start;
      if (duration > 100) {
        console.log(`[DB] Fetched ${products.length} products in ${duration}ms`);
      }
      res.json(products);
    } catch (err: any) {
      console.error('Error fetching products from DB:', err);
      res.status(500).json({ error: 'Failed to fetch products from database' });
    }
  });

  /**
   * GET /api/products/farmer/:id
   * Retrieves all non-deleted products for a specific farmer
   */
  app.get('/api/products/farmer/:id', asyncHandler(async (req, res) => {
    const products = await db.query('SELECT p.*, c.name as category_name FROM products p JOIN categories c ON p.category_id = c.id WHERE farmer_id = ? AND p.is_deleted = 0', [req.params.id]);
    res.json(products);
  }));

  /**
   * POST /api/products
   * Creates a new product listing (Farmer role required)
   */
  app.post('/api/products', async (req, res) => {
    try {
      const { 
        farmer_id, name, egg_type, description, 
        price_per_tray, stock_tray, 
        price_small, price_medium, price_large, price_xlarge, price_jumbo,
        stock_small, stock_medium, stock_large, stock_xlarge, stock_jumbo,
        category_id, image_url 
      } = req.body;
      
      if (!farmer_id || !category_id) {
        return res.status(400).json({ error: 'Farmer ID and Category ID are required' });
      }

      // Validation: Ensure the farmer and category actually exist
      const farmer = await db.queryOne("SELECT id FROM users WHERE id = ? AND role = 'farmer'", [farmer_id]);
      if (!farmer) {
        return res.status(400).json({ error: 'Invalid Farmer ID' });
      }

      const category = await db.queryOne('SELECT id FROM categories WHERE id = ?', [category_id]);
      if (!category) {
        return res.status(400).json({ error: 'Invalid Category ID' });
      }

      const result = await db.execute(`
        INSERT INTO products (
          farmer_id, name, egg_type, description, price, 
          price_per_tray, price_per_dozen, 
          price_small, price_medium, price_large, price_xlarge, price_jumbo,
          stock, stock_tray, stock_dozen,
          stock_small, stock_medium, stock_large, stock_xlarge, stock_jumbo,
          category_id, image_url
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          farmer_id, name, egg_type, description, 0, 
          price_per_tray || 0, 0, 
          price_small || 0, price_medium || 0, price_large || 0, price_xlarge || 0, price_jumbo || 0,
          0, stock_tray || 0, 0,
          stock_small || 0, stock_medium || 0, stock_large || 0, stock_xlarge || 0, stock_jumbo || 0,
          category_id, image_url
        ]);
      res.json({ id: (result as any).insertId });
    } catch (err: any) {
      console.error('Error creating product:', err);
      res.status(400).json({ error: `Failed to create product: ${err.message}` });
    }
  });

  /**
   * PUT /api/products/:id
   * Updates an existing product listing
   */
  app.put('/api/products/:id', async (req, res) => {
    try {
      const { 
        name, egg_type, description, 
        price_per_tray, stock_tray, 
        price_small, price_medium, price_large, price_xlarge, price_jumbo,
        stock_small, stock_medium, stock_large, stock_xlarge, stock_jumbo,
        category_id, image_url 
      } = req.body;

      if (!category_id) {
        return res.status(400).json({ error: 'Category ID is required' });
      }

      // Validation: Ensure selected category exists
      const category = await db.queryOne('SELECT id FROM categories WHERE id = ?', [category_id]);
      if (!category) {
        return res.status(400).json({ error: 'Invalid Category ID' });
      }

      await db.execute(`
        UPDATE products SET 
          name = ?, egg_type = ?, description = ?, 
          price = ?, price_per_tray = ?, price_per_dozen = ?, 
          price_small = ?, price_medium = ?, price_large = ?, price_xlarge = ?, price_jumbo = ?,
          stock = ?, stock_tray = ?, stock_dozen = ?, 
          stock_small = ?, stock_medium = ?, stock_large = ?, stock_xlarge = ?, stock_jumbo = ?,
          category_id = ?, image_url = ? 
        WHERE id = ?`,
        [
          name, egg_type, description, 
          0, price_per_tray || 0, 0, 
          price_small || 0, price_medium || 0, price_large || 0, price_xlarge || 0, price_jumbo || 0,
          0, stock_tray || 0, 0,
          stock_small || 0, stock_medium || 0, stock_large || 0, stock_xlarge || 0, stock_jumbo || 0,
          category_id, image_url, req.params.id
        ]);
      res.json({ success: true });
    } catch (err: any) {
      console.error('Error updating product:', err);
      res.status(400).json({ error: `Failed to update product: ${err.message}` });
    }
  });

  /**
   * DELETE /api/products/:id
   * Removes a product. Performs a soft delete (is_deleted=1) if the product is linked to past orders.
   */
  app.delete('/api/products/:id', async (req, res) => {
    try {
      // Check for relational integrity: orders that include this product
      const orderItem = await db.queryOne('SELECT id FROM order_items WHERE product_id = ? LIMIT 1', [req.params.id]);
      if (orderItem) {
        // Hide from marketplace but keep in DB for order history context
        await db.execute('UPDATE products SET is_deleted = 1 WHERE id = ?', [req.params.id]);
      } else {
        // Safe to completely remove if no one has ordered it yet
        await db.execute('DELETE FROM products WHERE id = ?', [req.params.id]);
      }
      res.json({ success: true });
    } catch (err: any) {
      console.error('Error deleting product:', err);
      res.status(400).json({ error: `Failed to delete product: ${err.message}` });
    }
  });

  // --- Category Routes ---

  /**
   * DELETE /api/orders/:id
   * Permanently removes an order record.
   * Business rule: Only 'delivered' or 'cancelled' orders can be deleted.
   */
  app.delete('/api/orders/:id', async (req, res) => {
    try {
      const { id } = req.params;
      console.log(`Attempting to delete order: ${id}`);
      
      // Verify order exists before deletion
      const order = await db.queryOne('SELECT status FROM orders WHERE id = ?', [id]);
      
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }

      // Re-enforce business rule if needed, or just allow it if we want it fully functional
      // The user requested: "only the cancelled and delivered can delete"
      const deletableStatuses = ['delivered', 'cancelled'];
      if (!deletableStatuses.includes(order.status)) {
        return res.status(400).json({ error: 'Only delivered or cancelled orders can be deleted to maintain record integrity.' });
      }

      // Delete reviews first (if any) - though ON DELETE CASCADE should handle it, explicit is safer in some envs
      await db.execute('DELETE FROM reviews WHERE order_id = ?', [id]);
      // Delete order items (foreign key constraint)
      await db.execute('DELETE FROM order_items WHERE order_id = ?', [id]);
      // Delete the order
      await db.execute('DELETE FROM orders WHERE id = ?', [id]);
      
      console.log(`Order ${id} deleted successfully`);
      res.json({ success: true, message: 'Order deleted successfully' });
    } catch (err: any) {
      console.error('Delete order error:', err);
      res.status(500).json({ error: `Failed to delete order: ${err.message}` });
    }
  });

  /**
   * GET /api/categories
   * Returns a list of all available product categories
   */
  app.get('/api/categories', async (req, res) => {
    const categories = await db.query('SELECT * FROM categories');
    res.json(categories);
  });

  // --- Messaging System Routes ---

  /**
   * GET /api/messages/conversations/:userId
   * Retrieves a list of active chat conversations for a specific user
   */
  app.get('/api/messages/conversations/:userId', async (req, res) => {
    const { userId } = req.params;
    const conversations = await db.query(`
      SELECT 
        u.id as other_user_id,
        u.name as other_user_name,
        u.role as other_user_role,
        m.content as last_message,
        m.created_at as last_message_time,
        (SELECT COUNT(*) FROM messages WHERE sender_id = u.id AND receiver_id = ? AND is_read = 0) as unread_count
      FROM users u
      JOIN messages m ON (m.sender_id = u.id AND m.receiver_id = ?) OR (m.sender_id = ? AND m.receiver_id = u.id)
      WHERE m.id IN (
        SELECT MAX(id)
        FROM messages
        WHERE sender_id = ? OR receiver_id = ?
        GROUP BY CASE WHEN sender_id = ? THEN receiver_id ELSE sender_id END
      )
      ORDER BY m.created_at DESC
    `, [userId, userId, userId, userId, userId, userId]);
    res.json(conversations);
  });

  /**
   * GET /api/messages/:userId/:otherId
   * Fetches the entire message history between two specific users
   */
  app.get('/api/messages/:userId/:otherId', async (req, res) => {
    const { userId, otherId } = req.params;
    const messages = await db.query(`
      SELECT * FROM messages 
      WHERE (sender_id = ? AND receiver_id = ?) 
         OR (sender_id = ? AND receiver_id = ?)
      ORDER BY created_at ASC
    `, [userId, otherId, otherId, userId]);
    res.json(messages);
  });

  /**
   * POST /api/messages
   * Sends a new message and creates a corresponding notification for the recipient
   */
  app.post('/api/messages', async (req, res) => {
    const { sender_id, receiver_id, content } = req.body;
    // Store message in database
    const result = await db.execute('INSERT INTO messages (sender_id, receiver_id, content) VALUES (?, ?, ?)',
      [sender_id, receiver_id, content]);
    
    // Auto-notify the receiver that they have a new message
    const sender = await db.queryOne('SELECT name FROM users WHERE id = ?', [sender_id]);
    await db.execute('INSERT INTO notifications (user_id, message) VALUES (?, ?)',
      [receiver_id, `New message from ${sender.name}: ${content.substring(0, 30)}${content.length > 30 ? '...' : ''}`]);
      
    res.json({ id: (result as any).insertId });
  });

  /**
   * PUT /api/messages/read/:userId/:otherId
   * Marks all messages from a specific sender to the current user as read
   */
  app.put('/api/messages/read/:userId/:otherId', async (req, res) => {
    const { userId, otherId } = req.params;
    await db.execute('UPDATE messages SET is_read = 1 WHERE sender_id = ? AND receiver_id = ?', [otherId, userId]);
    res.json({ success: true });
  });

  /**
   * DELETE /api/messages/:userId/:otherId
   * Deletes the entire conversation history between two users
   */
  app.delete('/api/messages/:userId/:otherId', async (req, res) => {
    const { userId, otherId } = req.params;
    await db.execute(`
      DELETE FROM messages 
      WHERE (sender_id = ? AND receiver_id = ?) 
         OR (sender_id = ? AND receiver_id = ?)
    `, [userId, otherId, otherId, userId]);
    res.json({ success: true });
  });

  // Helper middleware to check if user is admin
  const isAdmin = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const userId = req.signedCookies.user_id;
    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    try {
      const user = await db.queryOne('SELECT role FROM users WHERE id = ?', [userId]);
      if (user && user.role === 'admin') {
        next();
      } else {
        res.status(403).json({ error: 'Forbidden: Admin access required' });
      }
    } catch (err) {
      res.status(500).json({ error: 'Authentication check failed' });
    }
  };

  // --- Admin Category Management ---

  /**
   * POST /api/admin/categories
   * Adds a new product category
   */
  app.post('/api/admin/categories', isAdmin, async (req, res) => {
    const { name } = req.body;
    try {
      const result = await db.execute('INSERT INTO categories (name) VALUES (?)', [name]);
      res.json({ id: (result as any).insertId, name });
    } catch (err) {
      res.status(400).json({ error: 'Category already exists' });
    }
  });

  /**
   * PUT /api/admin/categories/:id
   * Updates a category name
   */
  app.put('/api/admin/categories/:id', isAdmin, async (req, res) => {
    const { name } = req.body;
    try {
      await db.execute('UPDATE categories SET name = ? WHERE id = ?', [name, req.params.id]);
      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ error: 'Category name already exists' });
    }
  });

  /**
   * DELETE /api/admin/categories/:id
   * Deletes a category if it's not currently being used by any products
   */
  app.delete('/api/admin/categories/:id', isAdmin, async (req, res) => {
    try {
      const categoryId = req.params.id;
      // Pre-check: Don't break products by orphanning their category
      const product = await db.queryOne('SELECT id FROM products WHERE category_id = ? LIMIT 1', [categoryId]);
      if (product) {
        return res.status(400).json({ error: 'Cannot delete category with active products. Please move or delete the products first.' });
      }
      await db.execute('DELETE FROM categories WHERE id = ?', [categoryId]);
      res.json({ success: true });
    } catch (err: any) {
      console.error('Error deleting category:', err);
      res.status(400).json({ error: `Failed to delete category: ${err.message}` });
    }
  });

  // --- Order Processing System ---

  /**
   * POST /api/orders
   * Processes a checkout: Creates order, adds items, updates stock levels, and notifies farmers
   * Uses a transaction to ensure all-or-nothing data integrity
   */
  app.post('/api/orders', async (req, res) => {
    const { customer_id, items, total_amount } = req.body;
    
    try {
      let orderId = 0;
      // Start transaction: If any step fails, the entire order is rolled back
      await db.transaction(async (conn) => {
        // 1. Create main order record
        const [result] = await conn.execute('INSERT INTO orders (customer_id, total_amount) VALUES (?, ?)', [customer_id, total_amount]);
        orderId = (result as any).insertId;

        // 2. Process each item in the cart
        for (const item of items) {
          const [products] = await conn.query('SELECT farmer_id, name, egg_type, price_per_tray FROM products WHERE id = ?', [item.id]) as any[];
          const product = products.length > 0 ? products[0] : null;
          
          if (!product) continue; // Skip if product somehow disappeared

          // Store snapshot of product details in order_items for historical accuracy
          // Use item.price from frontend (calculated snapshot) or fallback to current DB price
          const priceSnapshot = item.price || product.price_per_tray || 0;
          const eggTypeSnapshot = product.egg_type || 'Standard';
          const pricePerTraySnapshot = product.price_per_tray || 0;

          await conn.execute('INSERT INTO order_items (order_id, product_id, quantity, unit, price, egg_type, price_per_tray, price_per_dozen) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [orderId, item.id, item.quantity, 'tray', priceSnapshot, eggTypeSnapshot, pricePerTraySnapshot, 0]);
          
          // 3. Update stock based on the unit type ordered
          await conn.execute('UPDATE products SET stock_tray = stock_tray - ? WHERE id = ?', [item.quantity, item.id]);
          
          // 4. Notify farmer about the new order
          const farmerMessage = `New order for ${item.quantity} tray(s) of ${product.name}`;
          await conn.execute('INSERT INTO notifications (user_id, message) VALUES (?, ?)', [product.farmer_id, farmerMessage]);
          
          sendRealTimeNotification(product.farmer_id, farmerMessage);
        }

        // Notify customer that order is pending
        const [customers] = await conn.query('SELECT email, name FROM users WHERE id = ?', [customer_id]) as any[];
        const customer = customers.length > 0 ? customers[0] : null;
        const customerMessage = `Your order #${orderId} has been placed and is now pending.`;
        await conn.execute('INSERT INTO notifications (user_id, message) VALUES (?, ?)', [customer_id, customerMessage]);
        
        sendRealTimeNotification(customer_id, customerMessage);

        // --- Gmail Notification ---
        if (customer) {
          const emailSubject = `Order Placed: #${orderId} is now PENDING`;
          const emailBody = `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e1e8ed; border-radius: 12px; padding: 24px;">
              <h2 style="color: #059669;">Hello ${customer.name}!</h2>
              <p style="font-size: 16px; color: #374151;">Grateful news! Your order has been successfully placed.</p>
              <div style="background-color: #f0fdf4; border-left: 4px solid #10b981; padding: 16px; margin: 20px 0;">
                <p style="margin: 0; font-weight: bold; color: #065f46;">Order #${orderId}</p>
                <p style="margin: 4px 0 0; color: #047857;">Status: <strong style="text-transform: uppercase;">PENDING</strong></p>
                <p style="margin: 4px 0 0; color: #047857;">Total Amount: ₱${total_amount.toFixed(2)}</p>
              </div>
              <p style="color: #6b7280; font-size: 14px;">Our farmers are currently reviewing your order. You will receive another notification once it's being processed.</p>
              <hr style="border: none; border-top: 1px solid #e1e8ed; margin: 24px 0;" />
              <p style="color: #9ca3af; font-size: 12px; text-align: center;">This is an automated notification from EggMarket.</p>
            </div>
          `;
          sendGmailNotification(customer.email, emailSubject, emailBody);
        }
      });
      res.json({ id: orderId });
    } catch (err: any) {
      console.error('Order creation error:', err);
      res.status(500).json({ error: 'Failed to create order' });
    }
  });

  /**
   * GET /api/orders/customer/:id
   * Retrieves full order history for a customer, including meta data for reviews
   */
  app.get('/api/orders/customer/:id', async (req, res) => {
    const { startDate, endDate } = req.query;
    let dateFilter = '';
    const params: any[] = [req.params.id];
    
    if (startDate) {
      dateFilter += ' AND o.created_at >= ?';
      params.push(startDate);
    }
    if (endDate) {
      dateFilter += ' AND o.created_at <= ?';
      params.push(endDate);
    }

    const orders = await db.query(`
      SELECT o.*, 
             (SELECT p.farmer_id FROM order_items oi JOIN products p ON oi.product_id = p.id WHERE oi.order_id = o.id LIMIT 1) as farmer_id,
             (SELECT u.name FROM order_items oi JOIN products p ON oi.product_id = p.id JOIN users u ON p.farmer_id = u.id WHERE oi.order_id = o.id LIMIT 1) as farmer_name,
             (SELECT u.phone FROM order_items oi JOIN products p ON oi.product_id = p.id JOIN users u ON p.farmer_id = u.id WHERE oi.order_id = o.id LIMIT 1) as farmer_phone,
             (SELECT u.address FROM order_items oi JOIN products p ON oi.product_id = p.id JOIN users u ON p.farmer_id = u.id WHERE oi.order_id = o.id LIMIT 1) as farmer_address,
             (SELECT u.purok FROM order_items oi JOIN products p ON oi.product_id = p.id JOIN users u ON p.farmer_id = u.id WHERE oi.order_id = o.id LIMIT 1) as farmer_purok,
             (SELECT u.latitude FROM order_items oi JOIN products p ON oi.product_id = p.id JOIN users u ON p.farmer_id = u.id WHERE oi.order_id = o.id LIMIT 1) as farmer_latitude,
             (SELECT u.longitude FROM order_items oi JOIN products p ON oi.product_id = p.id JOIN users u ON p.farmer_id = u.id WHERE oi.order_id = o.id LIMIT 1) as farmer_longitude,
             (SELECT COUNT(*) FROM reviews r WHERE r.order_id = o.id) as is_reviewed
      FROM orders o 
      WHERE o.customer_id = ? ${dateFilter}
      ORDER BY o.created_at DESC
    `, params);
    res.json(orders);
  });

  /**
   * GET /api/orders/farmer/:id
   * Retrieves all orders for products belonging to a specific farmer
   */
  app.get('/api/orders/farmer/:id', async (req, res) => {
    const { startDate, endDate } = req.query;
    let dateFilter = '';
    const params: any[] = [req.params.id];
    
    if (startDate) {
      dateFilter += ' AND o.created_at >= ?';
      params.push(startDate);
    }
    if (endDate) {
      dateFilter += ' AND o.created_at <= ?';
      params.push(endDate);
    }

    const orders = await db.query(`
      SELECT DISTINCT o.*, u.name as customer_name, u.address as customer_address, u.purok as customer_purok, u.latitude as customer_latitude, u.longitude as customer_longitude
      FROM orders o 
      JOIN order_items oi ON o.id = oi.order_id 
      JOIN products p ON oi.product_id = p.id 
      JOIN users u ON o.customer_id = u.id
      WHERE p.farmer_id = ? ${dateFilter}
      ORDER BY o.created_at DESC
    `, params);
    res.json(orders);
  });

  /**
   * GET /api/orders/:id/items
   * Retrieves the individual items within a specific order
   */
  app.get('/api/orders/:id/items', async (req, res) => {
    const items = await db.query(`
      SELECT oi.*, oi.price as price_per_tray, p.name, p.image_url 
      FROM order_items oi 
      JOIN products p ON oi.product_id = p.id 
      WHERE oi.order_id = ?
    `, [req.params.id]);
    res.json(items);
  });

  /**
   * PUT /api/orders/:id/status
   * Updates an order's status and notifies the customer of the change
   */
  app.put('/api/orders/:id/status', async (req, res) => {
    const { status } = req.body;
    await db.execute('UPDATE orders SET status = ? WHERE id = ?', [status, req.params.id]);
    
    // Send tracking update notification to customer
    const orderData = await db.queryOne(`
      SELECT o.customer_id, u.email, u.name as customer_name 
      FROM orders o 
      JOIN users u ON o.customer_id = u.id 
      WHERE o.id = ?
    `, [req.params.id]);

    if (orderData) {
      const message = `Your order #${req.params.id} status updated to ${status}`;
      await db.execute('INSERT INTO notifications (user_id, message) VALUES (?, ?)', [orderData.customer_id, message]);
      
      // Broadcast real-time update
      sendRealTimeNotification(orderData.customer_id, message);

      // --- Gmail Notification ---
      const emailSubject = `Order Update: #${req.params.id} is now ${status.toUpperCase()}`;
      const emailBody = `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e1e8ed; border-radius: 12px; padding: 24px;">
          <h2 style="color: #059669;">Hello ${orderData.customer_name}!</h2>
          <p style="font-size: 16px; color: #374151;">Grateful news! Your order status has been updated.</p>
          <div style="background-color: #f0fdf4; border-left: 4px solid #10b981; padding: 16px; margin: 20px 0;">
            <p style="margin: 0; font-weight: bold; color: #065f46;">Order #${req.params.id}</p>
            <p style="margin: 4px 0 0; color: #047857;">New Status: <strong style="text-transform: uppercase;">${status}</strong></p>
          </div>
          <p style="color: #6b7280; font-size: 14px;">You can track your order in detail by visiting your dashboard in the EggMarket app.</p>
          <hr style="border: none; border-top: 1px solid #e1e8ed; margin: 24px 0;" />
          <p style="color: #9ca3af; font-size: 12px; text-align: center;">This is an automated notification from EggMarket.</p>
        </div>
      `;
      
      // Send asynchronously to avoid blocking the response
      sendGmailNotification(orderData.email, emailSubject, emailBody);
    }
    
    res.json({ success: true });
  });

  // --- Notification Routes ---

  /**
   * GET /api/notifications/:userId
   * Fetches latest 50 notifications for a user
   */
  app.get('/api/notifications/:userId', async (req, res) => {
    const notifications = await db.query('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50', [req.params.userId]);
    res.json(notifications);
  });

  // --- Farmer Verification Routes ---

  /**
   * POST /api/farmer/verify
   * Allows a farmer to upload a verification document
   */
  app.post('/api/farmer/verify', upload.single('document'), async (req, res) => {
    const { userId } = req.body;
    if (!req.file) {
      return res.status(400).json({ error: 'No document uploaded' });
    }

    try {
      const documentUrl = `/uploads/${req.file.filename}`;
      await db.execute(
        "UPDATE users SET verification_status = 'pending', verification_document = ? WHERE id = ?",
        [documentUrl, userId]
      );
      
      // Notify admins (all users with role 'admin')
      const admins = await db.query("SELECT id FROM users WHERE role = 'admin'");
      const farmer = await db.queryOne('SELECT name FROM users WHERE id = ?', [userId]);
      
      for (const admin of admins) {
        await db.execute('INSERT INTO notifications (user_id, message) VALUES (?, ?)', 
          [admin.id, `Farmer ${farmer.name} has submitted a verification document for review.`]);
      }

      res.json({ success: true, documentUrl });
    } catch (err: any) {
      console.error('Verification upload error:', err);
      res.status(500).json({ error: 'Failed to submit verification' });
    }
  });

  /**
   * GET /api/admin/pending-verifications
   * Retrieves all farmers with a pending verification status
   */
  app.get('/api/admin/pending-verifications', isAdmin, async (req, res) => {
    const pendingFarmers = await db.query(`
      SELECT id, name, email, phone, address, verification_status, verification_document 
      FROM users 
      WHERE verification_status = 'pending' AND role = 'farmer'
    `);
    res.json(pendingFarmers);
  });

  /**
   * PUT /api/admin/verify-farmer/:id
   * Approves or rejects a farmer's verification request
   */
  app.put('/api/admin/verify-farmer/:id', isAdmin, async (req, res) => {
    const { id } = req.params;
    const { status } = req.body; // 'verified' or 'rejected'

    if (!['verified', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Invalid verification status' });
    }

    try {
      await db.execute('UPDATE users SET verification_status = ? WHERE id = ?', [status, id]);
      
      // Notify the farmer
      const message = status === 'verified' 
        ? 'Congratulations! Your account has been verified.' 
        : 'Your verification request was rejected. Please review your documents and try again.';
        
      await db.execute('INSERT INTO notifications (user_id, message) VALUES (?, ?)', [id, message]);
      
      res.json({ success: true });
    } catch (err: any) {
      console.error('Admin verification update error:', err);
      res.status(500).json({ error: 'Failed to update verification status' });
    }
  });

  /**
   * PUT /api/notifications/:id/read
   * Marks a specific notification as read
   */
  app.put('/api/notifications/:id/read', async (req, res) => {
    await db.execute('UPDATE notifications SET is_read = 1 WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  });

  // --- Admin System & Statistics ---

  /**
   * GET /api/admin/stats
   * Aggregates high-level platform statistics for the admin dashboard
   */
  app.get('/api/admin/stats', isAdmin, async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      let dateFilter = '';
      const params: any[] = [];
      
      if (startDate) {
        dateFilter += ' AND created_at >= ?';
        params.push(startDate);
      }
      if (endDate) {
        dateFilter += ' AND created_at <= ?';
        params.push(endDate);
      }

      const totalUsers = await db.queryOne('SELECT COUNT(*) as count FROM users');
      const totalFarmers = await db.queryOne("SELECT COUNT(*) as count FROM users WHERE role = 'farmer'");
      const totalCustomers = await db.queryOne("SELECT COUNT(*) as count FROM users WHERE role = 'customer'");

      const totalOrders = await db.queryOne('SELECT COUNT(*) as count FROM orders WHERE 1=1' + dateFilter, params);
      const totalRevenue = await db.queryOne("SELECT SUM(total_amount) as total FROM orders WHERE status != 'cancelled'" + dateFilter, params);
    
    res.json({
        totalUsers: totalUsers?.count || 0,
        totalFarmers: totalFarmers?.count || 0,
        totalCustomers: totalCustomers?.count || 0,
        totalOrders: totalOrders?.count || 0,
        totalRevenue: totalRevenue?.total || 0,
      });
    } catch (err: any) {
      console.error('Admin stats error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * GET /api/admin/activity
   * Returns a refined timeline of recent platform interactions for the dashboard feed
   */
  app.get('/api/admin/activity', isAdmin, async (req, res) => {
    try {
      // Aggregating 4 major activity types into a unified feed
      const activity = await db.query(`
        (SELECT 
          CAST('user_signup' AS CHAR) as type, 
          CAST(name AS CHAR) as message, 
          CAST(role AS CHAR) as meta,
          created_at 
         FROM users)
        UNION ALL
        (SELECT 
          CAST('order_placed' AS CHAR) as type, 
          CAST(CONCAT('Order #', id) AS CHAR) as message, 
          CAST(total_amount AS CHAR) as meta,
          created_at 
         FROM orders)
        UNION ALL
        (SELECT 
          CAST('product_added' AS CHAR) as type, 
          CAST(name AS CHAR) as message, 
          CAST(price_per_tray AS CHAR) as meta,
          created_at 
         FROM products)
        UNION ALL
        (SELECT 
          CAST('farmer_verified' AS CHAR) as type, 
          CAST(name AS CHAR) as message, 
          CAST(verification_status AS CHAR) as meta,
          created_at 
         FROM users 
         WHERE role = 'farmer' AND verification_status = 'verified')
        ORDER BY created_at DESC
        LIMIT 15
      `);
      res.json(activity);
    } catch (err: any) {
      console.error('Admin activity fetch error:', err);
      res.status(500).json({ error: 'Failed to fetch activity feed' });
    }
  });

  /**
   * GET /api/admin/users
   * Lists all registered users for admin overview
   */
  app.get('/api/admin/users', isAdmin, async (req, res) => {
    try {
      const users = await db.query('SELECT id, name, email, role, status FROM users');
      res.json(users);
    } catch (err: any) {
      console.error('Admin users fetch error:', err);
      res.status(500).json({ error: 'Failed to fetch users' });
    }
  });

  /**
   * POST /api/admin/users
   * Allows admin to manually create a new user account
   */
  app.post('/api/admin/users', isAdmin, async (req, res) => {
    const { name, email, password, role } = req.body;
    try {
      const result = await db.execute('INSERT INTO users (name, email, password, role, status) VALUES (?, ?, ?, ?, ?)',
        [name, email, password, role, 'approved']);
      const user = await db.queryOne('SELECT id, name, email, role, status FROM users WHERE id = ?', [(result as any).insertId]);
      res.json(user);
    } catch (err: any) {
      console.error('Admin user creation error:', err);
      if (err.code === 'ER_DUP_ENTRY') {
        return res.status(400).json({ error: 'Email already exists' });
      }
      res.status(500).json({ error: `Failed to create user: ${err.message}` });
    }
  });

  /**
   * PUT /api/admin/users/:id
   * Allows admin to update user profiles, including password resets
   */
  app.put('/api/admin/users/:id', isAdmin, async (req, res) => {
    const { name, email, password, role } = req.body;
    try {
      if (password) {
        // Update includes password change
        await db.execute('UPDATE users SET name = ?, email = ?, password = ?, role = ? WHERE id = ?',
          [name, email, password, role, req.params.id]);
      } else {
        // Standard profile update (ignore password)
        await db.execute('UPDATE users SET name = ?, email = ?, role = ? WHERE id = ?',
          [name, email, role, req.params.id]);
      }
      res.json({ success: true });
    } catch (err: any) {
      console.error('Admin user update error:', err);
      if (err.code === 'ER_DUP_ENTRY') {
        return res.status(400).json({ error: 'Email already exists' });
      }
      res.status(500).json({ error: `Failed to update user: ${err.message}` });
    }
  });

  /**
   * PUT /api/admin/users/:id/status
   * Quickly toggles a user's account status (e.g., 'approved', 'suspended')
   */
  app.put('/api/admin/users/:id/status', isAdmin, async (req, res) => {
    const { status } = req.body;
    await db.execute('UPDATE users SET status = ? WHERE id = ?', [status, req.params.id]);
    res.json({ success: true });
  });

  /**
   * DELETE /api/admin/users/:id
   * Removes a user and all their associated data (cascading cleanup)
   * Only allowed if the user has no transaction history (orders)
   */
  app.delete('/api/admin/users/:id', isAdmin, async (req, res) => {
    try {
      const userId = req.params.id;
      // Check if user has orders
      const hasOrders = await db.queryOne('SELECT id FROM orders WHERE customer_id = ? LIMIT 1', [userId]);
      const hasFarmerOrders = await db.queryOne('SELECT o.id FROM orders o JOIN order_items oi ON o.id = oi.order_id JOIN products p ON oi.product_id = p.id WHERE p.farmer_id = ? LIMIT 1', [userId]);

      if (hasOrders || hasFarmerOrders) {
        return res.status(400).json({ error: 'Cannot delete user with active or past orders. Try suspending them instead.' });
      }

      await db.transaction(async (conn) => {
        // Cleanup all related data
        await conn.execute('DELETE FROM notifications WHERE user_id = ?', [userId]);
        await conn.execute('DELETE FROM messages WHERE sender_id = ? OR receiver_id = ?', [userId, userId]);
        await conn.execute('DELETE FROM reviews WHERE customer_id = ? OR farmer_id = ?', [userId, userId]);
        
        // Delete farmer's products
        const [productsResult] = await conn.execute('DELETE FROM products WHERE farmer_id = ?', [userId]);
        console.log(`Deleted ${(productsResult as any).affectedRows || 0} products for farmer ${userId}`);
        
        await conn.execute('DELETE FROM users WHERE id = ?', [userId]);
      });
      
      res.json({ success: true });
    } catch (err: any) {
      console.error('Error deleting user:', err);
      res.status(400).json({ error: `Failed to delete user: ${err.message}` });
    }
  });

  /**
   * GET /api/admin/orders
   * Lists all platform orders for administrative oversight
   */
  app.get('/api/admin/orders', isAdmin, async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      let dateFilter = '';
      const params: any[] = [];
      
      if (startDate) {
        dateFilter += ' AND o.created_at >= ?';
        params.push(startDate);
      }
      if (endDate) {
        dateFilter += ' AND o.created_at <= ?';
        params.push(endDate);
      }

      const orders = await db.query(`
        SELECT o.*, u.name as customer_name 
        FROM orders o 
        JOIN users u ON o.customer_id = u.id
        WHERE 1=1 ${dateFilter}
        ORDER BY o.created_at DESC
      `, params);
      res.json(orders);
    } catch (err: any) {
      console.error('Admin orders fetch error:', err);
      res.status(500).json({ error: 'Failed to fetch orders' });
    }
  });

  // --- Admin Reporting Routes ---

  /**
   * GET /api/admin/reports/sales
   * Returns monthly revenue and order count for the last 12 months
   */
  app.get('/api/admin/reports/sales', isAdmin, async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      let dateFilter = '';
      const params: any[] = [];
      
      if (startDate) {
        dateFilter += ' AND created_at >= ?';
        params.push(startDate);
      }
      if (endDate) {
        dateFilter += ' AND created_at <= ?';
        params.push(endDate);
      }

      const reports = await db.query(`
        SELECT 
          DATE_FORMAT(created_at, '%Y-%m') as month,
          COUNT(*) as order_count,
          SUM(total_amount) as revenue
        FROM orders
        WHERE status != 'cancelled' ${dateFilter}
        GROUP BY month
        ORDER BY month DESC
        LIMIT 12
      `, params);
      res.json(reports);
    } catch (err: any) {
      console.error('Admin sales report error:', err);
      res.status(500).json({ error: 'Failed to fetch sales report' });
    }
  });

  /**
   * GET /api/admin/reports/categories
   * Breaks down platform revenue by product category
   */
  app.get('/api/admin/reports/categories', isAdmin, async (req, res) => {
    const reports = await db.query(`
      SELECT c.name as name, SUM(oi.quantity * oi.price) as value
      FROM order_items oi
      JOIN products p ON oi.product_id = p.id
      JOIN categories c ON p.category_id = c.id
      JOIN orders o ON oi.order_id = o.id
      WHERE o.status != 'cancelled'
      GROUP BY c.id
      ORDER BY value DESC
    `);
    res.json(reports);
  });

  /**
   * GET /api/admin/reports/farmers
   * Lists top 10 farmers based on total revenue generated
   */
  app.get('/api/admin/reports/farmers', isAdmin, async (req, res) => {
    const reports = await db.query(`
      SELECT u.name as name, SUM(o.total_amount) as value
      FROM orders o
      JOIN order_items oi ON o.id = oi.order_id
      JOIN products p ON oi.product_id = p.id
      JOIN users u ON p.farmer_id = u.id
      WHERE o.status != 'cancelled'
      GROUP BY u.id
      ORDER BY value DESC
      LIMIT 10
    `);
    res.json(reports);
  });

  // --- Site Settings Management ---

  /**
   * GET /api/settings
   * Returns all platform-wide configurations (Site name, contact info, etc.)
   */
  app.get('/api/settings', async (req, res) => {
    try {
      const settings = await db.query('SELECT * FROM settings');
      const settingsMap = settings.reduce((acc: any, curr: any) => {
        acc[curr.key] = curr.value;
        return acc;
      }, {});
      res.json(settingsMap);
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch settings' });
    }
  });

  /**
   * PUT /api/settings
   * Bulk updates platform settings
   */
  app.put('/api/settings', async (req, res) => {
    try {
      const updates = req.body;
      await db.transaction(async (conn) => {
        for (const [key, value] of Object.entries(updates)) {
          await conn.execute('REPLACE INTO settings (\`key\`, value) VALUES (?, ?)', [key, String(value)]);
        }
      });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to update settings' });
    }
  });

  // --- User Profile & Self-Management ---

  /**
   * GET /api/users/admin
   * Retrieves the main platform administrator's public profile
   */
  app.get('/api/users/admin', async (req, res) => {
    const admin = await db.queryOne("SELECT id, name, email, role FROM users WHERE role = 'admin' LIMIT 1");
    res.json(admin);
  });

  /**
   * GET /api/users/:id
   * Fetches profile details for a specific user
   */
  app.get('/api/users/:id', async (req, res) => {
    const user = await db.queryOne('SELECT id, name, email, role, status, phone, address, purok, latitude, longitude FROM users WHERE id = ?', [req.params.id]);
    if (user) {
      res.json(user);
    } else {
      res.status(404).json({ error: 'User not found' });
    }
  });

  /**
   * PUT /api/users/:id
   * Updates a user's own profile information
   */
  app.put('/api/users/:id', async (req, res) => {
    const { name, email, phone, address, purok, latitude, longitude } = req.body;
    console.log(`Updating user ${req.params.id} with coords:`, { latitude, longitude });
    
    if (phone && phone.length !== 11) {
      return res.status(400).json({ error: 'Phone number must be exactly 11 digits' });
    }

    try {
      await db.execute(
        'UPDATE users SET name = ?, email = ?, phone = ?, address = ?, purok = ?, latitude = ?, longitude = ? WHERE id = ?', 
        [name, email, phone, address, purok, latitude ?? null, longitude ?? null, req.params.id]
      );
      const user = await db.queryOne('SELECT id, name, email, role, status, phone, address, purok, latitude, longitude FROM users WHERE id = ?', [req.params.id]);
      console.log(`User ${req.params.id} updated successfully. New result latitude: ${user.latitude}`);
      res.json(user);
    } catch (err: any) {
      console.error('User update error:', err);
      if (err.code === 'ER_DUP_ENTRY') {
        return res.status(400).json({ error: 'Email already exists' });
      }
      res.status(500).json({ error: `Update failed: ${err.message}` });
    }
  });

  /**
   * PUT /api/users/:id/password
   * Allows a user to change their password, requiring verification of the current one
   */
  app.put('/api/users/:id/password', async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    const user = await db.queryOne('SELECT password FROM users WHERE id = ?', [req.params.id]);
    
    if (!user || user.password !== currentPassword) {
      return res.status(400).json({ error: 'Incorrect current password' });
    }

    await db.execute('UPDATE users SET password = ? WHERE id = ?', [newPassword, req.params.id]);
    res.json({ success: true, message: 'Password updated successfully' });
  });

  // --- Reviews & Ratings API ---

  /**
   * POST /api/reviews
   * Allows customers to rate and review farmers for specific orders
   */
  app.post('/api/reviews', async (req, res) => {
    const { customer_id, farmer_id, order_id, rating, comment } = req.body;
    try {
      // Check if review already exists for this order
      const existing = await db.queryOne('SELECT id FROM reviews WHERE order_id = ? AND customer_id = ?', [order_id, customer_id]);
      if (existing) {
        return res.status(400).json({ error: 'You have already reviewed this order' });
      }

      await db.execute(`
        INSERT INTO reviews (customer_id, farmer_id, order_id, rating, comment)
        VALUES (?, ?, ?, ?, ?)
      `, [customer_id, farmer_id, order_id, rating, comment]);
      
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to submit review' });
    }
  });

  /**
   * GET /api/farmers
   * Lists all approved farmers who have location coordinates set (for the map feature)
   */
  app.get('/api/farmers', async (req, res) => {
    const farmers = await db.query(`
      SELECT u.id, u.name, u.email, u.phone, u.address, u.purok, u.latitude, u.longitude,
             (SELECT COUNT(*) FROM products WHERE farmer_id = u.id AND is_deleted = 0) as product_count,
             (SELECT AVG(rating) FROM reviews WHERE farmer_id = u.id) as average_rating
      FROM users u
      WHERE u.role = 'farmer' AND u.status = 'approved' AND u.latitude IS NOT NULL AND u.longitude IS NOT NULL
    `);
    res.json(farmers);
  });

  /**
   * GET /api/farmers/:id/reviews
   * Returns all customer reviews for a specific farmer
   */
  app.get('/api/farmers/:id/reviews', async (req, res) => {
    const reviews = await db.query(`
      SELECT r.*, u.name as customer_name 
      FROM reviews r
      JOIN users u ON r.customer_id = u.id
      WHERE r.farmer_id = ?
      ORDER BY r.created_at DESC
    `, [req.params.id]);
    res.json(reviews);
  });

  /**
   * GET /api/farmers/:id/rating
   * Calculates overall rating stats for a farmer
   */
  app.get('/api/farmers/:id/rating', async (req, res) => {
    const stats = await db.queryOne(`
      SELECT 
        AVG(rating) as average_rating,
        COUNT(*) as review_count
      FROM reviews
      WHERE farmer_id = ?
    `, [req.params.id]);
    res.json(stats);
  });

  // --- Farmer Statistics & Reports ---

  /**
   * GET /api/farmer/:id/sales-stats
   * Identifies the top 5 products by quantity sold for a farmer
   */
  app.get('/api/farmer/:id/sales-stats', async (req, res) => {
    const { id } = req.params;
    const { startDate, endDate } = req.query;
    let dateFilter = '';
    const params: any[] = [id];
    
    if (startDate) {
      dateFilter += ' AND o.created_at >= ?';
      params.push(startDate);
    }
    if (endDate) {
      dateFilter += ' AND o.created_at <= ?';
      params.push(endDate);
    }

    const stats = await db.query(`
      SELECT 
        p.name,
        SUM(oi.quantity) as total_sold,
        SUM(oi.quantity * oi.price) as total_revenue
      FROM order_items oi
      JOIN products p ON oi.product_id = p.id
      JOIN orders o ON oi.order_id = o.id
      WHERE p.farmer_id = ? AND o.status = 'delivered' ${dateFilter}
      GROUP BY p.id
      ORDER BY total_sold DESC
      LIMIT 5
    `, params);
    res.json(stats);
  });

  /**
   * GET /api/farmer/:id/reports/daily
   * Returns daily revenue for a farmer over the last 30 days
   */
  app.get('/api/farmer/:id/reports/daily', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { startDate, endDate } = req.query;
    let dateFilter = '';
    const params: any[] = [id];
    
    if (startDate) {
      dateFilter += ' AND o.created_at >= ?';
      params.push(startDate);
    }
    if (endDate) {
      dateFilter += ' AND o.created_at <= ?';
      params.push(endDate);
    }

    const reports = await db.query(`
      SELECT DATE(o.created_at) as date, SUM(oi.quantity * oi.price) as revenue
      FROM orders o
      JOIN order_items oi ON o.id = oi.order_id
      JOIN products p ON oi.product_id = p.id
      WHERE p.farmer_id = ? AND o.status != 'cancelled' ${dateFilter}
      GROUP BY date
      ORDER BY date ASC
      LIMIT 30
    `, params);
    res.json(reports);
  }));

  /**
   * GET /api/farmer/:id/stats
   * Summarizes a farmer's platform performance (Orders, Revenue, Products, Rating)
   */
  app.get('/api/farmer/:id/stats', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const totalOrders = await db.queryOne(`
      SELECT COUNT(DISTINCT o.id) as count 
      FROM orders o 
      JOIN order_items oi ON o.id = oi.order_id 
      JOIN products p ON oi.product_id = p.id 
      WHERE p.farmer_id = ?
    `, [id]);
    
    const totalRevenue = await db.queryOne(`
      SELECT SUM(oi.quantity * oi.price) as sum
      FROM order_items oi 
      JOIN products p ON oi.product_id = p.id 
      JOIN orders o ON oi.order_id = o.id
      WHERE p.farmer_id = ? AND o.status = 'delivered'
    `, [id]);
    
    const activeProducts = await db.queryOne('SELECT COUNT(*) as count FROM products WHERE farmer_id = ? AND is_deleted = 0', [id]);
    const averageRating = await db.queryOne('SELECT AVG(rating) as avg FROM reviews WHERE farmer_id = ?', [id]);

    res.json({
      totalOrders: totalOrders?.count || 0,
      totalRevenue: totalRevenue?.sum || 0,
      activeProducts: activeProducts?.count || 0,
      averageRating: averageRating?.avg || 0
    });
  }));

  // --- Vite Integration & SPA Static Serving ---
  // In development, we use the Vite middleware for HMR and modern JS support
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    // Handle SPA routing by defaulting all non-API requests to index.html
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  // Run migrations and data seeding
  // We do this without 'await' to ensure the server starts listening as fast as possible
  // and doesn't get stuck if the DB is slow or hanging.
  runMigrations()
    .then(() => console.log('OPTIMISTIC: Database migrations and seeding completed successfully.'))
    .catch(err => {
      console.error('CRITICAL: Migration task failed in the background!');
      console.error('Error details:', err);
    });

  // --- Bootstrap Server ---
  const PORT = 3000; // MUST be 3000 for this environment
  console.log(`Attempting to bind to port ${PORT}...`);
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`SUCCESS: Server is now listening on 0.0.0.0:${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  });
}

startServer().catch(err => {
  console.error('FAILED TO START SERVER:', err);
  process.exit(1);
});
