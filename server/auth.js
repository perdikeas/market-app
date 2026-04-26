const express = require('express')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const db = require('./db')

const router = express.Router()
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key'
const SALT_ROUNDS = 10

router.post('/register', async (req, res) => {
    const {email, password} = req.body
    if(!email || !password){
        return res.status(400).json({error: 'Email and password required'})
    }
    if(password.length < 6){
        return res.status(400).json({error: 'Password must be at least 6 characters'})
    }
    try{
        const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
        const stmt = db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)')
        const result = stmt.run(email, passwordHash)
        const token = jwt.sign({userId: result.lastInsertRowid }, 
            JWT_SECRET, { expiresIn: '7d'})
        res.json({ token, email});
    } catch(err){
        if(err.message.includes('UNIQUE')){
            return res.status(409).json({error: 'Email already registered'})
        }
        res.status(500).json({error: 'Registration failed'})
    }
})

router.post('/login', async (req,res) => {
    const {email, password} = req.body
    if(!email || !password){
        return res.status(400).json({error: 'Email and password required'})
    }
    try{
        const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email)
        if(!user){
            return res.status(401).json({error: 'Invalid email or password'})
        }
        const valid = await bcrypt.compare(password, user.password_hash)
        if(!valid){
            return res.status(401).json({error: 'Invalid email or password'})
        }
        const token = jwt.sign({userId: user.id}, JWT_SECRET, {expiresIn: '7d'})
        res.json({token, email})
    } catch(err){
        res.status(500).json({error: 'Login failed'})
    }
})

function authenticateToken(req, res, next){
    const authHeader = req.headers['authorization']
    const token = authHeader && authHeader.split(' ')[1]
    if(!token){
        return res.status(401).json({error: 'No token provided'})
    }
    try{
        const decoded = jwt.verify(token, JWT_SECRET)
        req.userId = decoded.userId
        next()
    } catch{
        res.status(403).json({error: 'Invalid or expired token'})
    }
}

module.exports = { router, authenticateToken}