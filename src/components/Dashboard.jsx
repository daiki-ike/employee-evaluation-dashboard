import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import './Dashboard.css'

const COLORS = ['#667eea', '#48bb78', '#f6ad55', '#fc8181', '#9f7aea', '#38b2ac']
const DEPARTMENT_COLORS = {
  '東京': '#667eea',
  '大阪': '#48bb78',
  '名古屋': '#f6ad55',
  '畠山部': '#fc8181'
}

const Dashboard = ({ user, salesRanking }) => {
  const [selectedTab, setSelectedTab] = useState('overall')

  // 売上ランキングデータの取得
  const rankingData = useMemo(() => {
    console.log('Dashboard received salesRanking prop:', salesRanking)
    // プロップスがあればそれを使用、なければローカルストレージから取得（フォールバック）
    if (salesRanking) return salesRanking

    const stored = localStorage.getItem('salesRanking')
    console.log('Dashboard loaded from localStorage:', stored ? 'Found data' : 'No data')
    if (!stored) return null
    return JSON.parse(stored)
  }, [salesRanking])

  // 現在のタブのデータを取得
  const currentData = useMemo(() => {
    if (!rankingData) return []

    // 部長の場合、自部署のみ表示
    if (user.role === 'manager') {
      const deptMap = {
        '東京': 'tokyo',
        '大阪': 'osaka',
        '名古屋': 'nagoya',
        '畠山部': 'hatakeyama'
      }
      const key = deptMap[user.department]
      return rankingData[key] || []
    }

    return rankingData[selectedTab] || []
  }, [rankingData, selectedTab, user])

  // サマリーデータの計算
  const summaryData = useMemo(() => {
    if (!currentData || currentData.length === 0) return null

    const totalSales = currentData.reduce((sum, item) => sum + (item.sales || 0), 0)
    const totalProfit = currentData.reduce((sum, item) => sum + (item.profit || 0), 0)
    const profitRate = totalSales > 0 ? (totalProfit / totalSales * 100) : 0

    return {
      totalSales,
      totalProfit,
      profitRate,
      memberCount: currentData.length
    }
  }, [currentData])

  // 売上シェアデータ（円グラフ用）
  const shareData = useMemo(() => {
    if (!currentData || currentData.length === 0) return []

    // 上位5名とその他で構成
    const sortedData = [...currentData].sort((a, b) => (b.sales || 0) - (a.sales || 0))
    const top5 = sortedData.slice(0, 5)
    const others = sortedData.slice(5)

    const data = top5.map(item => ({
      name: item.name,
      value: item.sales || 0,
      share: item.share || 0
    }))

    if (others.length > 0) {
      const othersSales = others.reduce((sum, item) => sum + (item.sales || 0), 0)
      const othersShare = others.reduce((sum, item) => sum + (item.share || 0), 0)
      data.push({
        name: 'その他',
        value: othersSales,
        share: othersShare
      })
    }

    return data
  }, [currentData])

  // トップ10データ
  const top10Data = useMemo(() => {
    if (!currentData) return []
    return currentData.slice(0, 10)
  }, [currentData])

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
      {user.role !== 'manager' && (
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
            className={`tab-btn ${selectedTab === 'hatakeyama' ? 'active' : ''}`}
            onClick={() => setSelectedTab('hatakeyama')}
          >
            畠山部
          </button>
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
            <h3>売上シェア（全体内%）</h3>
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

        {/* トップ10売上ランキング */}
        {top10Data.length > 0 && (
          <div className="chart-section">
            <h3>トップ10売上ランキング</h3>
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={top10Data} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tickFormatter={(value) => `¥${(value / 10000).toFixed(0)}万`} />
                <YAxis type="category" dataKey="name" width={100} />
                <Tooltip formatter={(value) => formatCurrency(value)} />
                <Bar dataKey="sales" fill="#667eea" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* ランキングテーブル */}
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
              </tr>
            </thead>
            <tbody>
              {currentData.map((item, index) => (
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
                    {item.share ? `${item.share.toFixed(2)}%` : '-'}
                  </td>
                  <td className="number-cell">{formatCurrency(item.profit)}</td>
                  <td className="number-cell">
                    {item.profitShare ? `${item.profitShare.toFixed(2)}%` : '-'}
                  </td>
                  <td className="number-cell">
                    {item.profitRate ? `${item.profitRate.toFixed(1)}%` : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default Dashboard
