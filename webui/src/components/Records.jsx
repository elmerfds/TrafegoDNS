import React, { useState, useEffect } from 'react';
import './Records.css';

function Records() {
  const [records, setRecords] = useState([]);
  const [trackedRecordIds, setTrackedRecordIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [showTrackedOnly, setShowTrackedOnly] = useState(false);

  useEffect(() => {
    // Fetch records data
    fetchRecords();
  }, []);

  const fetchRecords = async () => {
    setLoading(true);
    try {
      // Fetch DNS records and tracked records in parallel
      const [recordsResponse, trackedResponse] = await Promise.all([
        fetch('/api/records'),
        fetch('/api/records/tracked')
      ]);
      
      if (!recordsResponse.ok) {
        throw new Error(`Failed to fetch DNS records: ${recordsResponse.status}`);
      }
      
      if (!trackedResponse.ok) {
        throw new Error(`Failed to fetch tracked records: ${trackedResponse.status}`);
      }
      
      // Parse responses
      const recordsData = await recordsResponse.json();
      const trackedRecords = await trackedResponse.json();
      
      // Create a set of tracked record IDs for efficient lookup
      const trackedIds = new Set();
      trackedRecords.forEach(record => {
        // Different providers may have different ID formats
        if (record.id) {
          trackedIds.add(record.id);
        } else if (record.name && record.type) {
          // Use composite key for providers that don't have IDs
          trackedIds.add(`${record.name}:${record.type}`);
        }
      });
      
      setRecords(recordsData);
      setTrackedRecordIds(trackedIds);
      setError(null);
    } catch (err) {
      setError(`Error: ${err.message}`);
      console.error('Error fetching records:', err);
    } finally {
      setLoading(false);
    }
  };

  // Filter records based on search input and filters
  const filteredRecords = records.filter(record => {
    // Filter by search text
    const matchesSearch = !filter || 
      record.name?.toLowerCase().includes(filter.toLowerCase()) ||
      record.content?.toLowerCase().includes(filter.toLowerCase());
    
    // Filter by record type
    const matchesType = !typeFilter || record.type === typeFilter;
    
    // Filter by tracked status
    const matchesTracked = !showTrackedOnly || isRecordTracked(record);
    
    return matchesSearch && matchesType && matchesTracked;
  });

  // Check if a record is tracked
  const isRecordTracked = (record) => {
    if (trackedRecordIds.has(record.id)) {
      return true;
    }
    
    // Check composite key for providers that don't have IDs
    if (record.name && record.type) {
      return trackedRecordIds.has(`${record.name}:${record.type}`);
    }
    
    return false;
  };

  // Get unique record types for filter dropdown
  const recordTypes = [...new Set(records.map(record => record.type))].sort();

  if (loading) {
    return (
      <div className="records loading">
        <div className="spinner"></div>
        <p>Loading DNS records...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="records error">
        <h1>Error Loading Records</h1>
        <p>{error}</p>
        <button onClick={fetchRecords}>Retry</button>
      </div>
    );
  }

  return (
    <div className="records">
      <h1>DNS Records</h1>
      
      <div className="records-controls">
        <div className="search-bar">
          <input
            type="text"
            placeholder="Search records..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
        
        <div className="filter-controls">
          <select 
            value={typeFilter} 
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="">All Record Types</option>
            {recordTypes.map(type => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
          
          <label className="tracked-checkbox">
            <input
              type="checkbox"
              checked={showTrackedOnly}
              onChange={() => setShowTrackedOnly(!showTrackedOnly)}
            />
            Show managed records only
          </label>
          
          <button className="refresh-button" onClick={fetchRecords}>
            Refresh
          </button>
        </div>
      </div>
      
      <div className="records-count">
        Showing {filteredRecords.length} of {records.length} records
      </div>
      
      <div className="records-table-container">
        <table className="records-table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Name</th>
              <th>Content</th>
              <th>TTL</th>
              <th>Managed</th>
              <th>Proxied</th>
            </tr>
          </thead>
          <tbody>
            {filteredRecords.length === 0 && (
              <tr className="no-records">
                <td colSpan="6">No DNS records found.</td>
              </tr>
            )}
            
            {filteredRecords.map((record, index) => (
              <tr 
                key={record.id || `${record.name}-${record.type}-${index}`}
                className={isRecordTracked(record) ? 'managed' : ''}
              >
                <td className="record-type">{record.type}</td>
                <td className="record-name">{record.name}</td>
                <td className="record-content">{record.content}</td>
                <td className="record-ttl">{record.ttl}</td>
                <td className="record-managed">
                  <span className={isRecordTracked(record) ? 'badge managed' : 'badge unmanaged'}>
                    {isRecordTracked(record) ? 'Yes' : 'No'}
                  </span>
                </td>
                <td className="record-proxied">
                  {record.proxied !== undefined ? (
                    <span className={record.proxied ? 'badge proxied' : 'badge unproxied'}>
                      {record.proxied ? 'Yes' : 'No'}
                    </span>
                  ) : (
                    <span className="badge na">N/A</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default Records;