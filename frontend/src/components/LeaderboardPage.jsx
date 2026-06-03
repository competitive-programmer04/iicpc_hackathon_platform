import React, { useState, useEffect } from 'react';
import './LeaderboardPage.css';

export default function LeaderboardPage({ onBackToUpload }) {
  const [leaderboardData, setLeaderboardData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const fetchLeaderboard = async () => {
      try {
        const response = await fetch('http://localhost:3000/api/v1/submissions/leaderboard');
        const result = await response.json();

        if (response.ok && result.success) {
          setLeaderboardData(result.data);
        } else {
          setError(result.message || 'Failed to retrieve active standings.');
        }
      } catch (err) {
        console.error('Leaderboard connection error:', err);
        setError('Network disconnect. Server is unreachable.');
      } finally {
        setLoading(false);
      }
    };

    fetchLeaderboard();
  }, []);

  // Filter leaderboard teams dynamically based on search
  const filteredData = leaderboardData.filter(team => 
    team.team_id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="leaderboard-container">
      <div className="leaderboard-header-section">
        <h1 className="leaderboard-title">🏆 Global Standings</h1>
        <p className="leaderboard-subtitle">Real-time rolling 24-hour evaluation rankings of contestant matching engines [1].</p>
      </div>

      {/* Dynamic Search Filter */}
      <div className="search-filter-wrapper">
        <input 
          type="text" 
          placeholder="Filter by Team ID..." 
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="search-input"
        />
        <button onClick={onBackToUpload} className="back-submit-btn">
          Submit New Binary
        </button>
      </div>

      {loading ? (
        <div className="leaderboard-status-container">
          <div className="loader-small"></div>
          <p>Compiling database analytics records...</p>
        </div>
      ) : error ? (
        <div className="leaderboard-error-banner">
          ⚠️ {error}
        </div>
      ) : (
        <div className="table-responsive-wrapper">
          <table className="leaderboard-table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Team ID</th>
                <th>Peak Throughput (TPS)</th>
                <th>Avg Latency (p50)</th>
                <th>Worst Latency (p99)</th>
                <th>Accuracy (%)</th>
                <th>Composite Score</th>
              </tr>
            </thead>
            <tbody>
              {filteredData.length === 0 ? (
                <tr>
                  <td colSpan="7" className="no-teams-found">No submissions matches found in the last 24 hours.</td>
                </tr>
              ) : (
                filteredData.map((row, index) => (
                  <tr key={row.submission_id} className={index === 0 ? 'top-rank-row' : ''}>
                    <td className="rank-cell">
                      {index === 0 ? '🥇 1' : index === 1 ? '🥈 2' : index === 2 ? '🥉 3' : index + 1}
                    </td>
                    <td className="team-cell">{row.team_id}</td>
                    <td>{parseInt(row.peak_tps).toLocaleString()}</td>
                    <td>{row.avg_p50_latency} ms</td>
                    <td>{row.avg_p99_latency} ms</td>
                    <td>{row.final_accuracy}%</td>
                    <td className="score-cell">{row.composite_score}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}