import express from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET;

// In-memory user store with hashed passwords
// Note: These passwords are pre-hashed. To generate new hashes, use the hashPassword.js utility
const users = [
  {
    id: 1,
    username: process.env.ADMIN_USERNAME,
    password: process.env.ADMIN_PASSWORD_HASH, 
    name: "Admin User",
    role: "admin",
  },
  {
    id: 2,
    username: process.env.DEMO_USERNAME,
    password: process.env.DEMO_PASSWORD_HASH,
    name: "Demo User",
    role: "user",
  },
];

// Utility function to hash passwords (use this to create new user passwords)
// You can call this endpoint to generate hashed passwords for new users
router.post("/hash-password", async (req, res) => {
  const { password } = req.body;
  
  if (!password) {
    return res.status(400).json({
      success: false,
      message: "Password is required",
    });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    res.json({
      success: true,
      hashedPassword,
      message: "Use this hash in your users array",
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Error hashing password",
    });
  }
});

// Login route
router.post("/login", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({
      success: false,
      message: "Username and password are required",
    });
  }

  try {
    // Find user
    const user = users.find((u) => u.username === username);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid username or password",
      });
    }

    // Compare password with hashed password
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Invalid username or password",
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: "24h" }
    );

    // Return user data (without password) and token
    res.json({
      success: true,
      message: "Login successful",
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
      },
      token,
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({
      success: false,
      message: "Server error during login",
    });
  }
});

// Verify token route
router.post("/verify", (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "No token provided",
    });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = users.find((u) => u.id === decoded.id);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User not found",
      });
    }

    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
      },
    });
  } catch (err) {
    res.status(401).json({
      success: false,
      message: "Invalid or expired token",
    });
  }
});

// Logout route
router.post("/logout", (req, res) => {
  res.json({
    success: true,
    message: "Logout successful",
  });
});

export default router;