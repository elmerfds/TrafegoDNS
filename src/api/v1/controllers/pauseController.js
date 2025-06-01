const logger = require('../../../utils/logger')

class PauseController {
  constructor(pauseManager) {
    this.pauseManager = pauseManager
  }

  /**
   * Pause system operations
   */
  async pauseSystem(req, res) {
    try {
      const { reason = 'manual', duration } = req.body
      const pausedBy = req.user?.username || 'unknown'

      if (!this.pauseManager) {
        return res.status(500).json({
          success: false,
          error: 'Pause manager not available'
        })
      }

      // Validate duration if provided
      if (duration !== undefined && (duration < 1 || duration > 1440)) {
        return res.status(400).json({
          success: false,
          error: 'Duration must be between 1 and 1440 minutes (24 hours)'
        })
      }

      const success = this.pauseManager.pause({ reason, duration, pausedBy })
      
      if (!success) {
        return res.status(400).json({
          success: false,
          error: 'System is already paused'
        })
      }

      const status = this.pauseManager.getStatus()
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
  }

  /**
   * Resume system operations
   */
  async resumeSystem(req, res) {
    try {
      const resumedBy = req.user?.username || 'unknown'

      if (!this.pauseManager) {
        return res.status(500).json({
          success: false,
          error: 'Pause manager not available'
        })
      }

      const success = this.pauseManager.resume(resumedBy)
      
      if (!success) {
        return res.status(400).json({
          success: false,
          error: 'System is not currently paused'
        })
      }

      const status = this.pauseManager.getStatus()
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
  }

  /**
   * Get current pause status
   */
  async getPauseStatus(req, res) {
    try {
      if (!this.pauseManager) {
        return res.status(500).json({
          success: false,
          error: 'Pause manager not available'
        })
      }

      const status = this.pauseManager.getStatus()

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
  }

  /**
   * Schedule pause with auto-resume
   */
  async schedulePause(req, res) {
    try {
      const { duration, reason = 'scheduled' } = req.body
      const pausedBy = req.user?.username || 'unknown'

      if (!duration || duration < 1 || duration > 1440) {
        return res.status(400).json({
          success: false,
          error: 'Duration must be between 1 and 1440 minutes (24 hours)'
        })
      }

      if (!this.pauseManager) {
        return res.status(500).json({
          success: false,
          error: 'Pause manager not available'
        })
      }

      const success = this.pauseManager.pause({ reason, duration, pausedBy })
      
      if (!success) {
        return res.status(400).json({
          success: false,
          error: 'System is already paused'
        })
      }

      const status = this.pauseManager.getStatus()
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
  }
}

module.exports = PauseController