import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import './Dashboard.css'

const COLORS = ['#667eea', '#48bb78', '#f6ad55', '#fc8181', '#9f7aea', '#38b2ac']
const DEPARTMENT_COLORS = {
  '東京': '#667eea',
  '大阪': '#48bb78',
  '名古屋': '#f6ad55',
  '企画開発': '#fc8181'
}

const Dashboard = ({ user, salesRanking }) => {
  // ユーザーのアクセス可能なタブを取得
  const accessibleTab = user.salesAccess?.tab || 'all'
  const shouldFilterDept = user.salesAccess?.filterDept || false
  const deptKey = user.salesAccess?.deptKey || null

  const [selectedTab, setSelectedTab] = useState(() => {
    // 部長の場合、アクセス可能なタブをデフォルトに
    if (user.role === 'manager' && accessibleTab !== 'all') {
      return accessibleTab
    }
    return 'overall'
  })

  // 売上ランキングデータの取得
  const rankingData = useMemo(() => {
    console.log('Dashboard received salesRanking prop:', salesRanking)
    if (salesRanking) return salesRanking

    const stored = localStorage.getItem('salesRanking')
    console.log('Dashboard loaded from localStorage:', stored ? 'Found data' : 'No data')
    if (!stored) return null
    return JSON.parse(stored)
  }, [salesRanking])

  // 現在のタブのデータを取得
  const currentTabData = useMemo(() => {
    if (!rankingData) return null

    // 部長の場合の処理
    if (user.role === 'manager' && accessibleTab !== 'all') {
      // 指定されたタブのデータを取得
      const data = rankingData[accessibleTab]
      if (!data) return null

      // 部署フィルタが必要な場合（deptKeyを使用）
      if (shouldFilterDept && deptKey) {
        // departmentsをフィルタ（deptKeyに一致する部署のみ表示）
        if (data.departments) {
          const filteredDepts = data.departments.filter(dept =>
            // deptKeyと部署名の照合（例: 'マネジメント' と 'マネジメント'）
            dept.name === deptKey ||
            dept.name.includes(deptKey) ||
            deptKey.includes(dept.name)
          )
          // teamSummaryも同様にフィルタ
          const filteredTeamSummary = data.teamSummary.filter(team =>
            team.team === deptKey ||
            team.team.includes(deptKey) ||
            deptKey.includes(team.team)
          )
          return {
            ...data,
            departments: filteredDepts,
            teamSummary: filteredTeamSummary.length > 0 ? filteredTeamSummary : data.teamSummary
          }
        }
      }
      return data
    }

    return rankingData[selectedTab] || null
  }, [rankingData, selectedTab, user, accessibleTab, shouldFilterDept])

  // 全体タブ用のデータ（配列）
  const overallData = useMemo(() => {
    if (selectedTab !== 'overall' || !currentTabData) return []
    return Array.isArray(currentTabData) ? currentTabData : []
  }, [selectedTab, currentTabData])

  // 他のタブ用のデータ（チーム別サマリー + 部門別ランキング）
  const branchData = useMemo(() => {
    if (selectedTab === 'overall' || !currentTabData) return null
    if (Array.isArray(currentTabData)) return null // 古い形式のデータ
    return currentTabData
  }, [selectedTab, currentTabData])

  // サマリーデータの計算
  const summaryData = useMemo(() => {
    if (selectedTab === 'overall') {
      if (!overallData || overallData.length === 0) return null
      const totalSales = overallData.reduce((sum, item) => sum + (item.sales || 0), 0)
      const totalProfit = overallData.reduce((sum, item) => sum + (item.profit || 0), 0)
      const profitRate = totalSales > 0 ? (totalProfit / totalSales * 100) : 0
      return { totalSales, totalProfit, profitRate, memberCount: overallData.length }
    } else {
      if (!branchData) return null
      const totalSales = branchData.teamSummary.reduce((sum, item) => sum + (item.sales || 0), 0)
      const totalProfit = branchData.teamSummary.reduce((sum, item) => sum + (item.profit || 0), 0)
      const profitRate = totalSales > 0 ? (totalProfit / totalSales * 100) : 0
      const memberCount = branchData.departments.reduce((sum, dept) => sum + dept.rankings.length, 0)
      return { totalSales, totalProfit, profitRate, memberCount }
    }
  }, [selectedTab, overallData, branchData])

  // 売上シェアデータ（円グラフ用）
  const shareData = useMemo(() => {
    if (selectedTab === 'overall') {
      // 全体タブ：上位5名 + その他
      if (!overallData || overallData.length === 0) return []
      const sortedData = [...overallData].sort((a, b) => (b.sales || 0) - (a.sales || 0))
      const top5 = sortedData.slice(0, 5)
      const others = sortedData.slice(5)
      
      const data = top5.map(item => ({
        name: item.name,
        value: item.sales || 0,
        share: item.salesRatio || 0
      }))
      
      if (others.length > 0) {
        const othersSales = others.reduce((sum, item) => sum + (item.sales || 0), 0)
        const othersShare = others.reduce((sum, item) => sum + (item.salesRatio || 0), 0)
        data.push({ name: 'その他', value: othersSales, share: othersShare })
      }
      return data
    } else {
      // 他のタブ：チーム別サマリー
      if (!branchData || !branchData.teamSummary) return []
      return branchData.teamSummary.map(item => ({
        name: item.team,
        value: item.sales || 0,
        share: item.salesRatio || 0
      }))
    }
  }, [selectedTab, overallData, branchData])

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('ja-JP', {
      style: 'currency',
      currency: 'JPY',
      minimumFractionDigits: 0
    }).format(value || 0)
  }

  if (!rankingData) {
    return (
      <div className="dashboard-container">
        <div className="dashboard-header">
          <h2>売上ランキングダッシュボード</h2>
          <nav className="dashboard-nav">
            <Link to="/evaluation">評価シート</Link>
            {user.role === 'admin' && <Link to="/upload">データアップロード</Link>}
          </nav>
        </div>
        <div className="no-data">
          <p>売上ランキングデータがありません</p>
          {user.role === 'admin' && (
            <Link to="/upload" className="upload-link">データをアップロード</Link>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <h2>売上ランキングダッシュボード</h2>
        <nav className="dashboard-nav">
          <Link to="/evaluation">評価シート</Link>
          {user.role === 'admin' && <Link to="/upload">データアップロード</Link>}
        </nav>
      </div>

      {/* タブナビゲーション */}
      {(user.role !== 'manager' || accessibleTab === 'all') && (
        <div className="tab-navigation">
          <button
            className={`tab-btn ${selectedTab === 'overall' ? 'active' : ''}`}
            onClick={() => setSelectedTab('overall')}
          >
            全体
          </button>
          <button
            className={`tab-btn ${selectedTab === 'tokyo' ? 'active' : ''}`}
            onClick={() => setSelectedTab('tokyo')}
          >
            東京
          </button>
          <button
            className={`tab-btn ${selectedTab === 'osaka' ? 'active' : ''}`}
            onClick={() => setSelectedTab('osaka')}
          >
            大阪
          </button>
          <button
            className={`tab-btn ${selectedTab === 'nagoya' ? 'active' : ''}`}
            onClick={() => setSelectedTab('nagoya')}
          >
            名古屋
          </button>
          <button
            className={`tab-btn ${selectedTab === 'kikakukaihatsu' ? 'active' : ''}`}
            onClick={() => setSelectedTab('kikakukaihatsu')}
          >
            企画開発
          </button>
        </div>
      )}

      {/* 部長用：アクセス中のタブ表示 */}
      {user.role === 'manager' && accessibleTab !== 'all' && (
        <div className="tab-navigation manager-tab">
          <span className="current-tab-label">
            {accessibleTab === 'tokyo' && '東京'}
            {accessibleTab === 'osaka' && '大阪'}
            {accessibleTab === 'nagoya' && '名古屋'}
            {accessibleTab === 'kikakukaihatsu' && '企画開発'}
            {shouldFilterDept && deptKey && ` (${deptKey})`}
          </span>
        </div>
      )}

      {/* サマリーカード */}
      {summaryData && (
        <div className="summary-cards">
          <div className="summary-card sales-card">
            <div className="card-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="card-content">
              <h3>総売上</h3>
              <p className="amount">{formatCurrency(summaryData.totalSales)}</p>
              <p className="sub-text">{summaryData.memberCount}名</p>
            </div>
          </div>
          <div className="summary-card profit-card">
            <div className="card-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
            <div className="card-content">
              <h3>総粗利益</h3>
              <p className="amount">{formatCurrency(summaryData.totalProfit)}</p>
              <p className="sub-text">粗利率: {summaryData.profitRate.toFixed(1)}%</p>
            </div>
          </div>
        </div>
      )}

      {/* グラフセクション */}
      <div className="charts-container">
        {/* 売上シェア円グラフ */}
        {shareData.length > 0 && (
          <div className="chart-section">
            <h3>{selectedTab === 'overall' ? '売上シェア（全体内%）' : 'チーム別売上シェア'}</h3>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={shareData}
                  cx="50%"
                  cy="50%"
                  labelLine={true}
                  label={({ name, share }) => `${name}: ${(share || 0).toFixed(1)}%`}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {shareData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => formatCurrency(value)} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* 全体タブ：詳細ランキングテーブル */}
      {selectedTab === 'overall' && overallData.length > 0 && (
        <div className="ranking-table-section">
          <h3>詳細ランキング</h3>
          <div className="table-wrapper">
            <table className="ranking-table">
              <thead>
                <tr>
                  <th>順位</th>
                  <th>氏名</th>
                  <th>売上</th>
                  <th>売上比率</th>
                  <th>粗利益</th>
                  <th>粗利比率</th>
                  <th>粗利益率</th>
                  <th className="chart-header">売上・粗利グラフ</th>
                </tr>
              </thead>
              <tbody>
                {overallData.map((item, index) => {
                  const maxSales = Math.max(...overallData.map(d => d.sales || 0))
                  const salesWidth = maxSales > 0 ? ((item.sales || 0) / maxSales * 100) : 0
                  const profitWidth = maxSales > 0 ? ((item.profit || 0) / maxSales * 100) : 0
                  
                  return (
                    <tr key={index} className={index < 3 ? 'top-rank' : ''}>
                      <td className="rank-cell">
                        {index < 3 ? (
                          <span className={`rank-badge rank-${index + 1}`}>{item.rank}</span>
                        ) : (
                          <span className="rank-number">{item.rank}</span>
                        )}
                      </td>
                      <td className="name-cell">{item.name}</td>
                      <td className="number-cell">{formatCurrency(item.sales)}</td>
                      <td className="number-cell">
                        {item.salesRatio ? `${item.salesRatio.toFixed(2)}%` : '-'}
                      </td>
                      <td className="number-cell">{formatCurrency(item.profit)}</td>
                      <td className="number-cell">
                        {item.profitRatio ? `${item.profitRatio.toFixed(2)}%` : '-'}
                      </td>
                      <td className="number-cell">
                        {item.profitRate ? `${item.profitRate.toFixed(1)}%` : '-'}
                      </td>
                      <td className="chart-cell">
                        <div className="inline-chart">
                          <div className="bar-row">
                            <div 
                              className="inline-bar sales-bar" 
                              style={{ width: `${salesWidth}%` }}
                              title={`売上: ${formatCurrency(item.sales)}`}
                            />
                          </div>
                          <div className="bar-row">
                            <div 
                              className="inline-bar profit-bar" 
                              style={{ width: `${profitWidth}%` }}
                              title={`粗利: ${formatCurrency(item.profit)}`}
                            />
                          </div>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 他のタブ：部門別ランキングテーブル */}
      {selectedTab !== 'overall' && branchData && branchData.departments && (
        <div className="department-rankings">
          {branchData.departments.map((dept, deptIndex) => {
            const maxSales = Math.max(...dept.rankings.map(d => d.sales || 0))
            
            return (
              <div key={deptIndex} className="ranking-table-section department-section">
                <h3>{dept.name} ランキング</h3>
                <div className="table-wrapper">
                  <table className="ranking-table">
                    <thead>
                      <tr>
                        <th>順位</th>
                        <th>氏名</th>
                        <th>売上</th>
                        <th>部内売上比率</th>
                        <th>粗利益</th>
                        <th>部内粗利比率</th>
                        <th>粗利益率</th>
                        <th className="chart-header">売上・粗利グラフ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dept.rankings.map((item, index) => {
                        const salesWidth = maxSales > 0 ? ((item.sales || 0) / maxSales * 100) : 0
                        const profitWidth = maxSales > 0 ? ((item.profit || 0) / maxSales * 100) : 0
                        
                        return (
                          <tr key={index} className={index < 3 ? 'top-rank' : ''}>
                            <td className="rank-cell">
                              {index < 3 ? (
                                <span className={`rank-badge rank-${index + 1}`}>{item.rank}</span>
                              ) : (
                                <span className="rank-number">{item.rank}</span>
                              )}
                            </td>
                            <td className="name-cell">{item.name}</td>
                            <td className="number-cell">{formatCurrency(item.sales)}</td>
                            <td className="number-cell">
                              {item.salesRatio ? `${item.salesRatio.toFixed(2)}%` : '-'}
                            </td>
                            <td className="number-cell">{formatCurrency(item.profit)}</td>
                            <td className="number-cell">
                              {item.profitRatio ? `${item.profitRatio.toFixed(2)}%` : '-'}
                            </td>
                            <td className="number-cell">
                              {item.profitRate ? `${item.profitRate.toFixed(1)}%` : '-'}
                            </td>
                            <td className="chart-cell">
                              <div className="inline-chart">
                                <div className="bar-row">
                                  <div 
                                    className="inline-bar sales-bar" 
                                    style={{ width: `${salesWidth}%` }}
                                    title={`売上: ${formatCurrency(item.sales)}`}
                                  />
                                </div>
                                <div className="bar-row">
                                  <div 
                                    className="inline-bar profit-bar" 
                                    style={{ width: `${profitWidth}%` }}
                                    title={`粗利: ${formatCurrency(item.profit)}`}
                                  />
                                </div>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default Dashboard
