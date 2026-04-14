import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import uploadRouter from './routes/upload.js'
import openclawRouter from './routes/openclaw.js'
import glossaryRouter from './routes/glossaryPrepare.js'
import glossaryFinalizeRouter from './routes/glossaryFinalize.js'

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors())
app.use(express.json())

app.use('/api/upload', uploadRouter)
app.use('/api/openclaw', openclawRouter)
app.use('/api/glossary', glossaryRouter)
app.use('/api/glossary', glossaryFinalizeRouter)

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.listen(PORT, () => {
  console.log(`✅ Meeting Recorder Backend running on port ${PORT}`)
})
