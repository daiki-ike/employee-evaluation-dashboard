import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import './Dashboard.css'

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

const Dashboard = ({ user, salesData }) => {
  const [selectedEmployee, setSelectedEmployee] = useState('')
  const [selectedYear, setSelectedYear] = useState('')
  const [selectedDepartment, setSelectedDepartment] = useState('')

  // データのフィルタリング
  const filteredData = useMemo(() => {
    if (!salesData) return []

    let data = [...salesData]

    // 部長の場合、自部署のみ表示
    if (user.role === 'manager') {
      data = data.filter(item => item.department === user.department)
    }

    // フィルター適用
    if (selectedDepartment) {
      data = data.filter(item => item.department === selectedDepartment)
    }

    if (selectedEmployee) {
      data = data.filter(item => item.name === selectedEmployee)
    }

    if (selectedYear) {
      data = data.filter(item => item.year === parseInt(selectedYear))
    }

    return data
  }, [salesData, user, selectedDepartment, selectedEmployee, selectedYear])

  // 集計データの計算
  const summaryData = useMemo(() => {
    if (!filteredData || filteredData.length === 0) return null

    // 全体の集計
    const totalSales = filteredData.reduce((sum, item) => sum + item.sales, 0)
    const totalProfit = filteredData.reduce((sum, item) => sum + item.profit, 0)

    // 部署別集計
    const departmentData = {}
    filteredData.forEach(item => {
      if (!departmentData[item.department]) {
        departmentData[item.department] = { sales: 0, profit: 0 }
      }
      departmentData[item.department].sales += item.sales
      departmentData[item.department].profit += item.profit
    })

    // 個人別集計
    const employeeData = {}
    filteredData.forEach(item => {
      const key = `${item.name}_${item.year}`
      if (!employeeData[key]) {
        employeeData[key] = { name: item.name, year: item.year, sales: 0, profit: 0 }
      }
      employeeData[key].sales += item.sales
      employeeData[key].profit += item.profit
    })

    return {
      total: { sales: totalSales, profit: totalProfit },
      byDepartment: departmentData,
      byEmployee: Object.values(employeeData),
      pieData: Object.entries(departmentData).map(([name, data]) => ({ name, value: data.sales }))
    }
  }, [filteredData])

  // 年度別データの準備
  const yearlyData = useMemo(() => {
    if (!filteredData || filteredData.length === 0) return []

    const yearMap = {}
    filteredData.forEach(item => {
      if (!yearMap[item.year]) {
        yearMap[item.year] = { year: item.year, sales: 0, profit: 0 }
      }
      yearMap[item.year].sales += item.sales
      yearMap[item.year].profit += item.profit
    })

    return Object.values(yearMap).sort((a, b) => a.year - b.year)
  }, [filteredData])

  // フィルター用のリスト
  const employees = useMemo(() => {
    if (!salesData) return []
    const uniqueEmployees = [...new Set(salesData.map(item => item.name))]
    return uniqueEmployees.sort()
  }, [salesData])

  const years = useMemo(() => {
    if (!salesData) return []
    const uniqueYears = [...new Set(salesData.map(item => item.year))]
    return uniqueYears.sort()
  }, [salesData])

  const departments = useMemo(() => {
    if (!salesData) return []
    const uniqueDepartments = [...new Set(salesData.map(item => item.department))]
    return uniqueDepartments.sort()
  }, [salesData])

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('ja-JP', {
      style: 'currency',
      currency: 'JPY',
      minimumFractionDigits: 0
    }).format(value)
  }

  if (!salesData || salesData.length === 0) {
    return (
      <div className="dashboard-container">
        <div className="dashboard-header">
          <h2>売上・利益ダッシュボード</h2>
          <nav className="dashboard-nav">
            <Link to="/evaluation">評価シート</Link>
            {user.role === 'admin' && <Link to="/upload">データアップロード</Link>}
          </nav>
        </div>
        <div className="no-data">
          <p>データがありません</p>
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
        <h2>売上・利益ダッシュボード</h2>
        <nav className="dashboard-nav">
          <Link to="/evaluation">評価シート</Link>
          {user.role === 'admin' && <Link to="/upload">データアップロード</Link>}
        </nav>
      </div>

      {/* フィルター */}
      <div className="filters">
        <div className="filter-group">
          <label>年度</label>
          <select value={selectedYear} onChange={(e) => setSelectedYear(e.target.value)}>
            <option value="">全て</option>
            {years.map(year => (
              <option key={year} value={year}>{year}年</option>
            ))}
          </select>
        </div>

        {user.role !== 'manager' && (
          <div className="filter-group">
            <label>部署</label>
            <select value={selectedDepartment} onChange={(e) => setSelectedDepartment(e.target.value)}>
              <option value="">全て</option>
              {departments.map(dept => (
                <option key={dept} value={dept}>{dept}</option>
              ))}
            </select>
          </div>
        )}

        <div className="filter-group">
          <label>社員</label>
          <select value={selectedEmployee} onChange={(e) => setSelectedEmployee(e.target.value)}>
            <option value="">全て</option>
            {employees.map(emp => (
              <option key={emp} value={emp}>{emp}</option>
            ))}
          </select>
        </div>

        <button onClick={() => {
          setSelectedYear('')
          setSelectedDepartment('')
          setSelectedEmployee('')
        }} className="clear-filters">
          フィルタークリア
        </button>
      </div>

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
              <p className="amount">{formatCurrency(summaryData.total.sales)}</p>
            </div>
          </div>
          <div className="summary-card profit-card">
            <div className="card-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
            <div className="card-content">
              <h3>総利益</h3>
              <p className="amount profit">{formatCurrency(summaryData.total.profit)}</p>
            </div>
          </div>
        </div>
      )}

      {/* チャートセクション */}
      <div className="charts-container">
        {/* 年度別推移グラフ */}
        {yearlyData.length > 0 && (
          <div className="chart-section">
            <h3>年度別推移</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={yearlyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="year" label={{ value: '年度', position: 'insideBottom', offset: -5 }} />
                <YAxis tickFormatter={(value) => `¥${value / 10000}万`} />
                <Tooltip formatter={(value) => formatCurrency(value)} />
                <Legend />
                <Bar dataKey="sales" fill="#667eea" name="売上" radius={[4, 4, 0, 0]} />
                <Bar dataKey="profit" fill="#48bb78" name="利益" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* 部署別売上構成比 */}
        {summaryData && summaryData.pieData.length > 0 && (
          <div className="chart-section">
            <h3>部署別売上構成比</h3>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={summaryData.pieData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {summaryData.pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => formatCurrency(value)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* データテーブル */}
      <div className="data-table-section">
        <h3>詳細データ</h3>
        <table className="data-table">
          <thead>
            <tr>
              <th>氏名</th>
              <th>部署</th>
              <th>年度</th>
              <th>売上</th>
              <th>利益</th>
            </tr>
          </thead>
          <tbody>
            {filteredData.map((item, index) => (
              <tr key={index}>
                <td>{item.name}</td>
                <td>{item.department}</td>
                <td>{item.year}年</td>
                <td>{formatCurrency(item.sales)}</td>
                <td>{formatCurrency(item.profit)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default Dashboard
