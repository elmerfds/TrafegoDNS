const express = require('express')
const router = express.Router()
const { authenticate } = require('../middleware/authMiddleware')
const logger = require('../../../utils/logger')

/**
 * @swagger
 * /api/v1/system/pause:
 *   post:
 *     summary: Pause system operations
 *     tags: [System Control]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *                 enum: [manual, scheduled, maintenance]
 *                 default: manual
 *               duration:
 *                 type: number
 *                 description: Auto-resume duration in minutes (optional)
 *                 minimum: 1
 *                 maximum: 1440
 *     responses:
 *       200:
 *         description: System paused successfully
 *       400:
 *         description: System already paused or invalid request
 *       401:
 *         description: Unauthorized
 */
router.post('/pause', authenticate, async (req, res) => {
  try {
    const { reason = 'manual', duration } = req.body
    const pausedBy = req.user?.username || 'unknown'

    const pauseManager = req.app.get('pauseManager')
    if (!pauseManager) {
      return res.status(500).json({
        success: false,
        error: 'Pause manager not available'
      })
    }

    const success = pauseManager.pause({ reason, duration, pausedBy })
    
    if (!success) {
      return res.status(400).json({
        success: false,
        error: 'System is already paused'
      })
    }

    const status = pauseManager.getStatus()
    logger.info(`System paused by ${pausedBy}`, { reason, duration })

    res.json({
      success: true,
      message: 'System operations paused',
      data: status
    })
  } catch (error) {
    logger.error('Failed to pause system', error)
    res.status(500).json({
      success: false,
      error: 'Failed to pause system operations'
    })
  }
})

/**
 * @swagger
 * /api/v1/system/resume:
 *   post:
 *     summary: Resume system operations
 *     tags: [System Control]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: System resumed successfully
 *       400:
 *         description: System is not paused
 *       401:
 *         description: Unauthorized
 */
router.post('/resume', authenticate, async (req, res) => {
  try {
    const resumedBy = req.user?.username || 'unknown'

    const pauseManager = req.app.get('pauseManager')
    if (!pauseManager) {
      return res.status(500).json({
        success: false,
        error: 'Pause manager not available'
      })
    }

    const success = pauseManager.resume(resumedBy)
    
    if (!success) {
      return res.status(400).json({
        success: false,
        error: 'System is not currently paused'
      })
    }

    const status = pauseManager.getStatus()
    logger.info(`System resumed by ${resumedBy}`)

    res.json({
      success: true,
      message: 'System operations resumed',
      data: status
    })
  } catch (error) {
    logger.error('Failed to resume system', error)
    res.status(500).json({
      success: false,
      error: 'Failed to resume system operations'
    })
  }
})

/**
 * @swagger
 * /api/v1/system/pause-status:
 *   get:
 *     summary: Get current pause status
 *     tags: [System Control]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current pause status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     isPaused:
 *                       type: boolean
 *                     pausedAt:
 *                       type: string
 *                       format: date-time
 *                     pauseReason:
 *                       type: string
 *                     pauseDuration:
 *                       type: number
 *                     pausedBy:
 *                       type: string
 *                     timeRemaining:
 *                       type: number
 *                     autoResumeScheduled:
 *                       type: boolean
 *       401:
 *         description: Unauthorized
 */
router.get('/pause-status', authenticate, async (req, res) => {
  try {
    const pauseManager = req.app.get('pauseManager')
    if (!pauseManager) {
      return res.status(500).json({
        success: false,
        error: 'Pause manager not available'
      })
    }

    const status = pauseManager.getStatus()

    res.json({
      success: true,
      data: status
    })
  } catch (error) {
    logger.error('Failed to get pause status', error)
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve pause status'
    })
  }
})

/**
 * @swagger
 * /api/v1/system/pause-schedule:
 *   post:
 *     summary: Schedule a pause with automatic resume
 *     tags: [System Control]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - duration
 *             properties:
 *               duration:
 *                 type: number
 *                 description: Duration in minutes
 *                 minimum: 1
 *                 maximum: 1440
 *               reason:
 *                 type: string
 *                 default: scheduled
 *     responses:
 *       200:
 *         description: Scheduled pause activated
 *       400:
 *         description: Invalid duration or system already paused
 *       401:
 *         description: Unauthorized
 */
router.post('/pause-schedule', authenticate, async (req, res) => {
  try {
    const { duration, reason = 'scheduled' } = req.body
    const pausedBy = req.user?.username || 'unknown'

    if (!duration || duration < 1 || duration > 1440) {
      return res.status(400).json({
        success: false,
        error: 'Duration must be between 1 and 1440 minutes (24 hours)'
      })
    }

    const pauseManager = req.app.get('pauseManager')
    if (!pauseManager) {
      return res.status(500).json({
        success: false,
        error: 'Pause manager not available'
      })
    }

    const success = pauseManager.pause({ reason, duration, pausedBy })
    
    if (!success) {
      return res.status(400).json({
        success: false,
        error: 'System is already paused'
      })
    }

    const status = pauseManager.getStatus()
    logger.info(`Scheduled pause activated by ${pausedBy}`, { duration, reason })

    res.json({
      success: true,
      message: `System paused for ${duration} minutes with auto-resume`,
      data: status
    })
  } catch (error) {
    logger.error('Failed to schedule pause', error)
    res.status(500).json({
      success: false,
      error: 'Failed to schedule pause'
    })
  }
})

module.exports = router