import { useState } from 'react'
import './Login.css'

const Login = ({ onLogin }) => {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  // パスワード設定（実際の運用では環境変数などで管理）
  // departments: 評価シートで閲覧可能な部署
  // salesAccess: 売上ダッシュボードでのアクセス権限
  const passwords = {
    manager1: {
      role: 'manager',
      departments: ['東京本社 マネジメント部'],
      salesAccess: { tab: 'tokyo', filterDept: true, deptKey: 'マネジメント' }
    },
    manager2: {
      role: 'manager',
      departments: ['東京本社 制作1部'],
      salesAccess: { tab: 'tokyo', filterDept: true, deptKey: '制作1' }
    },
    manager3: {
      role: 'manager',
      departments: ['東京本社 制作2部'],
      salesAccess: { tab: 'tokyo', filterDept: true, deptKey: '制作2' }
    },
    manager4: {
      role: 'manager',
      departments: ['東京本社 制作3部'],
      salesAccess: { tab: 'tokyo', filterDept: true, deptKey: '制作3' }
    },
    manager5: {
      role: 'manager',
      departments: ['東京本社 企画開発/人事部', '沖縄支社 企画開発/人事部'],
      salesAccess: { tab: 'kikakukaihatsu', filterDept: false }
    },
    manager6: {
      role: 'manager',
      departments: ['名古屋支社'],  // 名古屋支社の全部署
      salesAccess: { tab: 'nagoya', filterDept: false }
    },
    manager7: {
      role: 'manager',
      departments: ['大阪支社 マネジメント部', '大阪支社 キャスティング部'],
      salesAccess: { tab: 'osaka', filterDept: true }
    },
    manager8: {
      role: 'manager',
      departments: ['経理部'],
      salesAccess: { tab: 'all', filterDept: false }  // 社長と同じ権限
    },
    president2025: {
      role: 'president',
      departments: ['全社'],
      salesAccess: { tab: 'all', filterDept: false }
    },
    admin2025: {
      role: 'admin',
      departments: ['全社'],
      salesAccess: { tab: 'all', filterDept: false }
    }
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    setError('')

    const userInfo = passwords[password]

    if (userInfo) {
      onLogin(userInfo)
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
            <li>部長アカウント (8種類)</li>
            <li>社長アカウント</li>
            <li>管理者アカウント</li>
          </ul>
        </div>
      </div>
    </div>
  )
}

export default Login
