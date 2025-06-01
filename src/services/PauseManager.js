const EventEmitter = require('events')
const { logger } = require('../utils/logger')

class PauseManager extends EventEmitter {
  constructor() {
    super()
    this.isPaused = false
    this.pausedAt = null
    this.autoResumeTimer = null
    this.pauseReason = null
    this.pauseDuration = null
    this.pausedBy = null
    
    logger.info('PauseManager initialized')
  }

  /**
   * Pause system operations
   * @param {Object} options - Pause options
   * @param {string} options.reason - Reason for pause ('manual', 'scheduled', 'maintenance')
   * @param {number} options.duration - Auto-resume duration in minutes (optional)
   * @param {string} options.pausedBy - User who initiated pause (optional)
   */
  pause(options = {}) {
    const { reason = 'manual', duration = null, pausedBy = 'system' } = options

    if (this.isPaused) {
      logger.warn('System is already paused')
      return false
    }

    this.isPaused = true
    this.pausedAt = new Date()
    this.pauseReason = reason
    this.pauseDuration = duration
    this.pausedBy = pausedBy

    logger.info('System operations paused', {
      reason,
      duration: duration ? `${duration} minutes` : 'indefinite',
      pausedBy,
      pausedAt: this.pausedAt.toISOString()
    })

    // Schedule auto-resume if duration specified
    if (duration && duration > 0) {
      this.scheduleAutoResume(duration)
    }

    // Notify all listeners
    this.emit('pause', {
      isPaused: this.isPaused,
      pausedAt: this.pausedAt,
      reason: this.pauseReason,
      duration: this.pauseDuration,
      pausedBy: this.pausedBy
    })

    return true
  }

  /**
   * Resume system operations
   * @param {string} resumedBy - User who initiated resume
   */
  resume(resumedBy = 'system') {
    if (!this.isPaused) {
      logger.warn('System is not currently paused')
      return false
    }

    const pauseDuration = this.pausedAt ? Date.now() - this.pausedAt.getTime() : 0

    this.clearAutoResumeTimer()
    this.isPaused = false
    const resumedAt = new Date()

    logger.info('System operations resumed', {
      resumedBy,
      resumedAt: resumedAt.toISOString(),
      totalPauseDuration: `${Math.round(pauseDuration / 1000)}s`,
      previousReason: this.pauseReason
    })

    // Reset pause state
    this.pausedAt = null
    this.pauseReason = null
    this.pauseDuration = null
    this.pausedBy = null

    // Notify all listeners
    this.emit('resume', {
      isPaused: this.isPaused,
      resumedAt,
      resumedBy,
      pauseDuration
    })

    return true
  }

  /**
   * Schedule automatic resume after specified duration
   * @private
   * @param {number} minutes - Duration in minutes
   */
  scheduleAutoResume(minutes) {
    this.clearAutoResumeTimer()
    
    const milliseconds = minutes * 60 * 1000
    this.autoResumeTimer = setTimeout(() => {
      logger.info(`Auto-resuming system after ${minutes} minutes`)
      this.resume('auto-timer')
    }, milliseconds)

    logger.info(`Auto-resume scheduled for ${minutes} minutes`)
  }

  /**
   * Clear auto-resume timer
   * @private
   */
  clearAutoResumeTimer() {
    if (this.autoResumeTimer) {
      clearTimeout(this.autoResumeTimer)
      this.autoResumeTimer = null
    }
  }

  /**
   * Get current pause status
   * @returns {Object} Current pause state
   */
  getStatus() {
    const now = new Date()
    let timeRemaining = null

    if (this.isPaused && this.pauseDuration && this.pausedAt) {
      const resumeTime = new Date(this.pausedAt.getTime() + (this.pauseDuration * 60 * 1000))
      timeRemaining = Math.max(0, resumeTime.getTime() - now.getTime())
    }

    return {
      isPaused: this.isPaused,
      pausedAt: this.pausedAt,
      pauseReason: this.pauseReason,
      pauseDuration: this.pauseDuration,
      pausedBy: this.pausedBy,
      timeRemaining: timeRemaining ? Math.round(timeRemaining / 1000) : null,
      autoResumeScheduled: !!this.autoResumeTimer
    }
  }

  /**
   * Check if operations should be paused
   * @param {string} operation - Operation being checked
   * @returns {boolean} True if operation should be paused
   */
  shouldPause(operation = 'general') {
    if (!this.isPaused) {
      return false
    }

    logger.debug(`Operation '${operation}' paused due to system pause`)
    return true
  }

  /**
   * Cleanup method
   */
  destroy() {
    this.clearAutoResumeTimer()
    this.removeAllListeners()
    logger.info('PauseManager destroyed')
  }
}

module.exports = PauseManager