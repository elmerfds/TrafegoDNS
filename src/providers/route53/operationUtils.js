/**
 * Operation utility functions for Route53 provider
 * This is a streamlined version that imports functions from other modules
 */
const { createRecord } = require('./create');
const { updateRecord } = require('./update');
const { deleteRecord } = require('./delete');
const { batchEnsureRecords } = require('./batch');

module.exports = {
  createRecord,
  updateRecord,
  deleteRecord,
  batchEnsureRecords
};