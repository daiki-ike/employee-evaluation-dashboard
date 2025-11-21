import { useState } from 'react'
import './Login.css'

const Login = ({ onLogin }) => {
  const [password, setPassword] = useState('')
  const [selectedDepartment, setSelectedDepartment] = useState('')
  const [showDepartmentSelect, setShowDepartmentSelect] = useState(false)
  const [error, setError] = useState('')

  // パスワード設定（実際の運用では環境変数などで管理）
  const passwords = {
    manager1: { role: 'manager', department: '営業1部' },
    manager2: { role: 'manager', department: '営業2部' },
    manager3: { role: 'manager', department: '営業3部' },
    manager4: { role: 'manager', department: '営業4部' },
    manager5: { role: 'manager', department: '営業5部' },
    manager6: { role: 'manager', department: '営業6部' },
    president2025: { role: 'president', department: '全社' },
    admin2025: { role: 'admin', department: '全社' }
  }

  const departments = [
    '営業1部',
    '営業2部',
    '営業3部',
    '営業4部',
    '営業5部',
    '営業6部'
  ]

  const handleSubmit = (e) => {
    e.preventDefault()
    setError('')

    const userInfo = passwords[password]

    if (userInfo) {
      if (userInfo.role === 'manager') {
        // 部長の場合、パスワードに紐づいた部署で自動ログイン
        onLogin(userInfo)
      } else {
        // 社長・管理者の場合、そのままログイン
        onLogin(userInfo)
      }
    } else {
      setError('パスワードが正しくありません')
    }
  }

  return (
    <div className="login-container">
      <div className="login-box">
        <h1>社員評価ダッシュボード</h1>
        <h2>ログイン</h2>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="password">パスワード</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="パスワードを入力"
              required
            />
          </div>

          {error && <div className="error-message">{error}</div>}

          <button type="submit" className="login-btn">ログイン</button>
        </form>

        <div className="login-info">
          <p>アカウント種別:</p>
          <ul>
            <li>部長アカウント (6種類)</li>
            <li>社長アカウント</li>
            <li>管理者アカウント</li>
          </ul>
        </div>
      </div>
    </div>
  )
}

export default Login
