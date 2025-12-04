// Google Sheets API ユーティリティ - 修正版
// 問題点: ヘッダー検出と金額パースのずれを修正

const GOOGLE_SHEETS_BASE_URL = 'https://docs.google.com/spreadsheets/d'

/**
 * スプレッドシートIDをURLから抽出
 */
export const extractSpreadsheetId = (url) => {
  const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/)
  return match ? match[1] : null
}

/**
 * Google Sheets の gviz API からデータを取得
 */
export const fetchSheetData = async (spreadsheetUrl, sheetName) => {
  const spreadsheetId = extractSpreadsheetId(spreadsheetUrl)
  if (!spreadsheetId) {
    throw new Error('無効なスプレッドシートURLです')
  }

  const encodedSheetName = encodeURIComponent(sheetName)
  const url = `${GOOGLE_SHEETS_BASE_URL}/${spreadsheetId}/gviz/tq?tqx=out:json&sheet=${encodedSheetName}`

  console.log(`[fetchSheetData] Fetching: ${sheetName}`)
  console.log(`[fetchSheetData] URL: ${url}`)

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`シート「${sheetName}」の取得に失敗しました`)
  }

  const text = await response.text()
  console.log(`[fetchSheetData] Response length: ${text.length} chars`)
  
  // gviz レスポンスから JSON を抽出
  const jsonMatch = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\);?$/)
  if (!jsonMatch) {
    console.error('[fetchSheetData] Failed to parse response. First 500 chars:', text.substring(0, 500))
    throw new Error('データの解析に失敗しました')
  }

  const json = JSON.parse(jsonMatch[1])
  const rows = json.table.rows || []
  const cols = json.table.cols || []

  console.log(`[fetchSheetData] Columns:`, cols.map(c => c.label || c.id))
  console.log(`[fetchSheetData] Total rows from API: ${rows.length}`)
  
  // 最初の行の生データを確認
  if (rows.length > 0) {
    console.log('[fetchSheetData] First row raw:', JSON.stringify(rows[0]).substring(0, 300))
  }

  // 2次元配列に変換
  const data = rows.map(row => {
    return row.c.map((cell, idx) => {
      if (!cell) return ''
      // 数値の場合はそのまま、フォーマット済み文字列がある場合はそれを使用
      if (cell.f !== undefined && cell.f !== null) {
        return cell.f
      }
      if (cell.v !== undefined && cell.v !== null) {
        return cell.v
      }
      return ''
    })
  })

  console.log(`[fetchSheetData] ${sheetName}: ${data.length} rows converted`)
  
  // 最初の行の変換後データを確認
  if (data.length > 0) {
    console.log('[fetchSheetData] First row converted:', data[0].slice(0, 5))
  }
  
  return data
}

/**
 * 金額文字列を数値に変換
 * 例: "¥69,853,871" → 69853871
 *     " ¥ 69,853,871 " → 69853871
 */
export const parseAmount = (value) => {
  if (typeof value === 'number') return value
  if (!value || value === '') return 0
  
  const str = String(value)
    .replace(/[¥￥\s,]/g, '')  // ¥、スペース、カンマを除去
    .trim()
  
  const num = parseFloat(str)
  return isNaN(num) ? 0 : num
}

/**
 * パーセント文字列を数値に変換
 * 例: "38.0%" → 38.0
 *     "38%" → 38
 */
export const parsePercent = (value) => {
  if (typeof value === 'number') return value
  if (!value || value === '') return 0
  
  const str = String(value).replace('%', '').trim()
  const num = parseFloat(str)
  return isNaN(num) ? 0 : num
}

/**
 * セクションを探す
 * 【セクション名】の形式を検索
 */
const findSection = (data, sectionKeywords) => {
  for (let i = 0; i < data.length; i++) {
    const row = data[i]
    const firstCell = String(row[0] || '').trim()
    
    // 【】で囲まれているか確認
    if (firstCell.startsWith('【') && firstCell.includes('】')) {
      // キーワードのいずれかが含まれているか
      const matches = sectionKeywords.some(keyword => firstCell.includes(keyword))
      if (matches) {
        console.log(`[findSection] Found: "${firstCell}" at row ${i}`)
        return i
      }
    }
  }
  console.log(`[findSection] Not found: ${sectionKeywords.join(', ')}`)
  return -1
}

/**
 * ヘッダー行から列インデックスを取得
 * 複数の候補名に対応
 */
const findColumnIndex = (headers, ...candidates) => {
  for (const candidate of candidates) {
    const index = headers.findIndex(h => {
      const header = String(h || '').trim()
      return header === candidate || header.includes(candidate)
    })
    if (index !== -1) {
      console.log(`[findColumnIndex] Found "${candidate}" at index ${index}`)
      return index
    }
  }
  console.log(`[findColumnIndex] Not found: ${candidates.join(', ')}`)
  return -1
}

/**
 * 部門別サマリーをパース
 */
export const parseDepartmentSummary = (data) => {
  console.log('[parseDepartmentSummary] Starting...')
  
  // 【部門別サマリー】または【チーム別サマリー】を探す
  const sectionRow = findSection(data, ['部門別サマリー', 'チーム別サマリー'])
  if (sectionRow === -1) {
    console.warn('[parseDepartmentSummary] Section not found')
    return []
  }

  // ヘッダー行（セクションの次の行）
  const headerRow = sectionRow + 1
  if (headerRow >= data.length) return []

  const headers = data[headerRow]
  console.log('[parseDepartmentSummary] Headers:', headers)

  // 列インデックスを取得
  const colRank = findColumnIndex(headers, '順位')
  const colDept = findColumnIndex(headers, '部門', 'チーム')
  const colSales = findColumnIndex(headers, '売上高', '売上')
  const colPayment = findColumnIndex(headers, '支払高', '支払')
  const colProfit = findColumnIndex(headers, '粗利益', '粗利')
  const colProfitRate = findColumnIndex(headers, '粗利益率', '粗利率')
  const colSalesRatio = findColumnIndex(headers, '全体売上比率', '支社内売上比率', '売上比率')
  const colProfitRatio = findColumnIndex(headers, '全体粗利比率', '支社内粗利比率', '粗利比率')

  const results = []
  
  // データ行を処理（ヘッダーの次から）
  for (let i = headerRow + 1; i < data.length; i++) {
    const row = data[i]
    const firstCell = String(row[0] || '').trim()
    
    // 次のセクションに到達したら終了
    if (firstCell.startsWith('【')) break
    // 空行または「合計」行はスキップ
    if (!firstCell || firstCell === '' || firstCell === '合計') continue
    // 順位が数字でない場合はスキップ
    if (colRank !== -1 && isNaN(parseInt(row[colRank]))) continue

    const dept = colDept !== -1 ? String(row[colDept] || '').trim() : ''
    if (!dept) continue

    results.push({
      rank: colRank !== -1 ? parseInt(row[colRank]) || 0 : results.length + 1,
      department: dept,
      sales: colSales !== -1 ? parseAmount(row[colSales]) : 0,
      payment: colPayment !== -1 ? parseAmount(row[colPayment]) : 0,
      profit: colProfit !== -1 ? parseAmount(row[colProfit]) : 0,
      profitRate: colProfitRate !== -1 ? parsePercent(row[colProfitRate]) : 0,
      salesRatio: colSalesRatio !== -1 ? parsePercent(row[colSalesRatio]) : 0,
      profitRatio: colProfitRatio !== -1 ? parsePercent(row[colProfitRatio]) : 0
    })
  }

  console.log('[parseDepartmentSummary] Results:', results.length)
  return results
}

/**
 * 個人ランキングをパース
 */
export const parsePersonalRanking = (data, sectionKeywords = ['個人ランキング']) => {
  console.log('[parsePersonalRanking] Starting with keywords:', sectionKeywords)
  
  const sectionRow = findSection(data, sectionKeywords)
  if (sectionRow === -1) {
    console.warn('[parsePersonalRanking] Section not found')
    return []
  }

  // ヘッダー行（セクションの次の行）
  const headerRow = sectionRow + 1
  if (headerRow >= data.length) return []

  const headers = data[headerRow]
  console.log('[parsePersonalRanking] Headers:', headers.slice(0, 10))

  // 列インデックスを取得
  const colRank = findColumnIndex(headers, '順位')
  const colName = findColumnIndex(headers, '氏名', '名前')
  const colTeam = findColumnIndex(headers, '所属チーム', 'チーム', '部署')
  const colSales = findColumnIndex(headers, '売上額', '売上')
  const colSalesRatio = findColumnIndex(headers, '売上全体比率', '部内売上比率', '売上比率')
  const colProfit = findColumnIndex(headers, '粗利額', '粗利益額', '粗利')
  const colProfitRatio = findColumnIndex(headers, '粗利全体比率', '部内粗利比率', '粗利比率')
  const colProfitRate = findColumnIndex(headers, '粗利益率', '粗利率')

  console.log('[parsePersonalRanking] Column indices:', {
    rank: colRank, name: colName, team: colTeam,
    sales: colSales, salesRatio: colSalesRatio,
    profit: colProfit, profitRatio: colProfitRatio, profitRate: colProfitRate
  })

  const results = []
  
  // データ行を処理
  for (let i = headerRow + 1; i < data.length; i++) {
    const row = data[i]
    const firstCell = String(row[0] || '').trim()
    
    // 次のセクションに到達したら終了
    if (firstCell.startsWith('【')) break
    // 空行はスキップ
    if (!firstCell || firstCell === '') continue
    
    // 氏名が空の場合はスキップ
    const name = colName !== -1 ? String(row[colName] || '').trim() : ''
    if (!name) continue

    const entry = {
      rank: colRank !== -1 ? parseInt(row[colRank]) || 0 : results.length + 1,
      name: name,
      team: colTeam !== -1 ? String(row[colTeam] || '').trim() : '',
      sales: colSales !== -1 ? parseAmount(row[colSales]) : 0,
      salesRatio: colSalesRatio !== -1 ? parsePercent(row[colSalesRatio]) : 0,
      profit: colProfit !== -1 ? parseAmount(row[colProfit]) : 0,
      profitRatio: colProfitRatio !== -1 ? parsePercent(row[colProfitRatio]) : 0,
      profitRate: colProfitRate !== -1 ? parsePercent(row[colProfitRate]) : 0
    }

    console.log(`[parsePersonalRanking] Row ${i}: ${entry.name}, sales=${entry.sales}, profit=${entry.profit}`)
    results.push(entry)
  }

  console.log('[parsePersonalRanking] Total results:', results.length)
  return results
}

/**
 * 全てのランキングセクションを取得
 */
export const parseAllRankings = (data) => {
  console.log('[parseAllRankings] Starting...')
  
  const sections = []
  
  for (let i = 0; i < data.length; i++) {
    const row = data[i]
    const firstCell = String(row[0] || '').trim()
    
    // 【xxx個人ランキング】または【xxxランキング】を探す
    if (firstCell.startsWith('【') && firstCell.includes('ランキング') && firstCell.includes('】')) {
      // セクション名を抽出
      const sectionName = firstCell.replace(/【|】/g, '').trim()
      if (!sectionName || sectionName === '') continue
      
      console.log(`[parseAllRankings] Found section: ${sectionName} at row ${i}`)
      
      // このセクションのデータを抽出
      const sectionData = data.slice(i)
      const ranking = parsePersonalRanking(sectionData, [sectionName])
      
      if (ranking.length > 0) {
        sections.push({
          sectionName,
          data: ranking
        })
      }
    }
  }
  
  console.log('[parseAllRankings] Total sections found:', sections.length)
  return sections
}

/**
 * シートからダッシュボード用データを取得
 */
export const fetchDashboardData = async (spreadsheetUrl, sheetNames) => {
  console.log('[fetchDashboardData] Starting...')
  
  const result = {
    departments: [],      // 部門別サマリー
    overallRanking: [],   // 全体個人ランキング
    departmentRankings: {}, // 部門別個人ランキング
    errors: []
  }

  for (const sheetName of sheetNames) {
    try {
      console.log(`[fetchDashboardData] Processing sheet: ${sheetName}`)
      const data = await fetchSheetData(spreadsheetUrl, sheetName)
      
      if (sheetName === '全体') {
        // 全体シートから部門別サマリーと全体ランキングを取得
        result.departments = parseDepartmentSummary(data)
        result.overallRanking = parsePersonalRanking(data, ['全体 個人ランキング', '個人ランキング'])
      } else {
        // 各部門シートからチーム別サマリーと個人ランキングを取得
        const teamSummary = parseDepartmentSummary(data)
        const allRankings = parseAllRankings(data)
        
        result.departmentRankings[sheetName] = {
          teamSummary,
          rankings: allRankings
        }
      }
    } catch (error) {
      console.error(`[fetchDashboardData] Error in sheet ${sheetName}:`, error)
      result.errors.push({ sheet: sheetName, error: error.message })
    }
  }

  console.log('[fetchDashboardData] Complete')
  console.log('  - Departments:', result.departments.length)
  console.log('  - Overall ranking:', result.overallRanking.length)
  console.log('  - Department rankings:', Object.keys(result.departmentRankings))
  
  return result
}

// =====================================
// 以下は既存の評価システム用関数
// =====================================

/**
 * 評価を数値に変換
 * ◎=3, ○=2, △=1, ×=0
 */
export const convertEvaluationToNumber = (value) => {
  if (typeof value === 'number') return value
  const str = String(value || '').trim()
  
  switch (str) {
    case '◎': return 3
    case '○': return 2
    case '△': return 1
    case '×': return 0
    default:
      const num = parseFloat(str)
      return isNaN(num) ? 0 : num
  }
}

export const parseEvaluationData = (rawData, type) => {
  if (!rawData || rawData.length === 0) return []

  if (type === 'master') {
    const headers = rawData[0]
    const idx = {
      categoryNo: headers.findIndex(h => String(h).includes('カテゴリNo')),
      major: headers.findIndex(h => String(h).includes('大カテゴリ')),
      minor: headers.findIndex(h => String(h).includes('小カテゴリ')),
      criteria: headers.findIndex(h => String(h).includes('審査内容')),
      questionNo: headers.findIndex(h => String(h).includes('設問No'))
    }

    return rawData.slice(1).filter(row => row.length >= 5).map(row => ({
      categoryNo: row[idx.categoryNo],
      majorCategory: row[idx.major],
      minorCategory: row[idx.minor],
      criteria: row[idx.criteria],
      questionNo: parseInt(row[idx.questionNo]) || 0
    }))
  } else if (type === 'selfEvaluation' || type === 'managerEvaluation') {
    return rawData.slice(1).map(row => ({
      timestamp: row[0],
      name: row[1],
      department: row[2],
      answers: row.slice(3)
    }))
  } else if (type === 'totalScore') {
    return rawData.slice(1).map(row => ({
      name: row[1],
      totalScore: parseFloat(row[169]) || 0
    }))
  }

  return rawData
}

/**
 * 全シートから売上データを取得
 * DataUpload.jsxから呼び出される
 */
export const fetchAllSalesSheets = async (spreadsheetUrl, sheetNames = ['全体', '東京', '大阪', '名古屋', '企画開発']) => {
  console.log('[fetchAllSalesSheets] Starting...')
  
  const result = {
    overall: [],
    tokyo: [],
    osaka: [],
    nagoya: [],
    kikakukaihatsu: []
  }

  const sheetMapping = {
    '全体': 'overall',
    '東京': 'tokyo',
    '大阪': 'osaka',
    '名古屋': 'nagoya',
    '企画開発': 'kikakukaihatsu'
  }

  for (const sheetName of sheetNames) {
    try {
      console.log(`[fetchAllSalesSheets] Fetching sheet: ${sheetName}`)
      const data = await fetchSheetData(spreadsheetUrl, sheetName)
      
      console.log(`[fetchAllSalesSheets] ${sheetName} length:`, data.length)
      
      // ヘッダー行（「氏名」を含む行）を探す
      const rankings = parseRankingByHeader(data)
      
      const key = sheetMapping[sheetName] || sheetName.toLowerCase()
      if (result[key] !== undefined) {
        result[key] = rankings
      }
      
      console.log(`[fetchAllSalesSheets] ${sheetName}: ${rankings.length} total records`)
    } catch (error) {
      console.error(`[fetchAllSalesSheets] Error fetching ${sheetName}:`, error)
    }
  }

  console.log('[fetchAllSalesSheets] Complete')
  console.log('[fetchAllSalesSheets] Result summary:', {
    overall: result.overall.length,
    tokyo: result.tokyo.length,
    osaka: result.osaka.length,
    nagoya: result.nagoya.length,
    kikakukaihatsu: result.kikakukaihatsu.length
  })
  return result
}

/**
 * ヘッダー行を探してランキングデータをパース
 * 【】セクションがなくても動作する
 */
const parseRankingByHeader = (data) => {
  console.log('[parseRankingByHeader] Starting... data length:', data.length)
  
  // 最初の10行をデバッグ出力
  for (let i = 0; i < Math.min(10, data.length); i++) {
    const row = data[i]
    if (row) {
      console.log(`[parseRankingByHeader] Row ${i}:`, row.slice(0, 6).map(c => String(c || '').substring(0, 15)))
    }
  }
  
  const allResults = []
  
  for (let i = 0; i < data.length; i++) {
    const row = data[i]
    if (!row) continue
    
    // 「氏名」を含む行をヘッダーとして検出（順位は任意）
    const hasName = row.some(cell => String(cell || '').includes('氏名'))
    const hasTeamOrSales = row.some(cell => {
      const s = String(cell || '')
      return s.includes('所属') || s.includes('チーム') || s.includes('売上')
    })
    
    if (hasName) {
      console.log(`[parseRankingByHeader] Row ${i} has 氏名, hasTeamOrSales=${hasTeamOrSales}`)
    }
    
    if (hasName && hasTeamOrSales) {
      console.log(`[parseRankingByHeader] Found header at row ${i}:`, row.slice(0, 8))
      
      // この行をヘッダーとしてデータをパース
      const headers = row
      const colRank = headers.findIndex(h => String(h || '').includes('順位'))
      const colName = headers.findIndex(h => String(h || '').includes('氏名'))
      const colTeam = headers.findIndex(h => String(h || '').includes('所属') || String(h || '').includes('チーム'))
      const colSales = headers.findIndex(h => String(h || '').includes('売上額') || String(h || '').includes('売上'))
      const colProfit = headers.findIndex(h => String(h || '').includes('粗利額') || String(h || '').includes('粗利益'))
      const colProfitRate = headers.findIndex(h => String(h || '').includes('粗利益率') || String(h || '').includes('粗利率'))
      
      console.log('[parseRankingByHeader] Column indices:', { 
        rank: colRank, name: colName, team: colTeam, 
        sales: colSales, profit: colProfit, profitRate: colProfitRate 
      })
      
      // ヘッダーの次の行からデータを読み取る
      for (let j = i + 1; j < data.length; j++) {
        const dataRow = data[j]
        if (!dataRow) continue
        
        // 次のヘッダー行に到達したら終了
        const isNextHeader = dataRow.some(cell => String(cell || '').includes('氏名'))
        if (isNextHeader && j > i + 1) {
          console.log(`[parseRankingByHeader] Hit next header at row ${j}, stopping this section`)
          break
        }
        
        // 名前が空ならスキップ
        const name = colName !== -1 ? String(dataRow[colName] || '').trim() : ''
        if (!name) continue
        
        // 名前が「氏名」や数字だけならスキップ（ヘッダー行の可能性）
        if (name === '氏名' || name === '名前' || /^\d+$/.test(name)) continue
        
        // 順位を取得（なければ連番）
        let rank = 0
        if (colRank !== -1 && dataRow[colRank]) {
          rank = parseInt(dataRow[colRank]) || 0
        }
        if (rank === 0) {
          rank = allResults.length + 1
        }
        
        const entry = {
          rank: rank,
          name: name,
          team: colTeam !== -1 ? String(dataRow[colTeam] || '').trim() : '',
          sales: colSales !== -1 ? parseAmount(dataRow[colSales]) : 0,
          profit: colProfit !== -1 ? parseAmount(dataRow[colProfit]) : 0,
          profitRate: colProfitRate !== -1 ? parsePercent(dataRow[colProfitRate]) : 0
        }
        
        console.log(`[parseRankingByHeader] Row ${j}: ${entry.name}, sales=${entry.sales}`)
        allResults.push(entry)
      }
    }
  }
  
  console.log(`[parseRankingByHeader] Total parsed: ${allResults.length} records`)
  if (allResults.length > 0) {
    console.log('[parseRankingByHeader] First record:', allResults[0])
    console.log('[parseRankingByHeader] Last record:', allResults[allResults.length - 1])
  }
  
  return allResults
}

/**
 * ランキングセクションをパース（内部関数）
 */
const parseRankingSection = (data) => {
  if (!data || data.length < 2) {
    console.log('[parseRankingSection] Not enough data rows')
    return []
  }
  
  // 最初の行はセクションタイトル、次の行はヘッダー
  const sectionTitle = String(data[0][0] || '').trim()
  const headers = data[1]
  
  console.log('[parseRankingSection] Section:', sectionTitle)
  console.log('[parseRankingSection] Headers:', headers)
  
  const colRank = headers.findIndex(h => String(h || '').includes('順位'))
  const colName = headers.findIndex(h => String(h || '').includes('氏名') || String(h || '').includes('名前'))
  const colTeam = headers.findIndex(h => String(h || '').includes('所属') || String(h || '').includes('チーム'))
  const colSales = headers.findIndex(h => String(h || '').includes('売上額') || String(h || '').includes('売上高'))
  const colProfit = headers.findIndex(h => String(h || '').includes('粗利額') || String(h || '').includes('粗利益'))
  const colProfitRate = headers.findIndex(h => String(h || '').includes('粗利益率') || String(h || '').includes('粗利率'))
  
  console.log('[parseRankingSection] Column indices:', { 
    rank: colRank, name: colName, team: colTeam, 
    sales: colSales, profit: colProfit, profitRate: colProfitRate 
  })
  
  // 氏名列が見つからない場合は空を返す
  if (colName === -1) {
    console.log('[parseRankingSection] Name column not found, skipping')
    return []
  }
  
  const results = []
  
  for (let i = 2; i < data.length; i++) {
    const row = data[i]
    const firstCell = String(row[0] || '').trim()
    
    // 次のセクションに到達したら終了
    if (firstCell.startsWith('【')) {
      console.log(`[parseRankingSection] Hit next section at row ${i}, stopping`)
      break
    }
    
    // 空行または「合計」行はスキップ
    if (!firstCell || firstCell === '' || firstCell === '合計') continue
    
    const name = colName !== -1 ? String(row[colName] || '').trim() : ''
    if (!name) continue
    
    const entry = {
      rank: colRank !== -1 ? parseInt(row[colRank]) || 0 : results.length + 1,
      name: name,
      team: colTeam !== -1 ? String(row[colTeam] || '').trim() : '',
      sales: colSales !== -1 ? parseAmount(row[colSales]) : 0,
      profit: colProfit !== -1 ? parseAmount(row[colProfit]) : 0,
      profitRate: colProfitRate !== -1 ? parsePercent(row[colProfitRate]) : 0
    }
    
    results.push(entry)
  }
  
  console.log(`[parseRankingSection] Parsed ${results.length} records`)
  if (results.length > 0) {
    console.log('[parseRankingSection] First record:', results[0])
  }
  
  return results
}

/**
 * 生データを構造化データに変換
 * DataUpload.jsxから呼び出される
 */
export const convertToStructuredData = (rawData, type) => {
  console.log(`[convertToStructuredData] Converting type: ${type}`)
  
  if (!rawData || rawData.length === 0) {
    console.warn('[convertToStructuredData] No data to convert')
    return []
  }

  // 評価データの場合
  if (type === 'master' || type === 'selfEvaluation' || type === 'managerEvaluation' || type === 'totalScore') {
    return parseEvaluationData(rawData, type)
  }

  // 売上データの場合
  if (type === 'sales' || type === 'ranking') {
    return convertSalesData(rawData)
  }

  // デフォルト: そのまま返す
  return rawData
}

/**
 * 売上データを変換（内部関数）
 */
const convertSalesData = (rawData) => {
  const results = []
  
  for (let i = 0; i < rawData.length; i++) {
    const row = rawData[i]
    const firstCell = String(row[0] || '').trim()
    
    // ランキングセクションを探す
    if (firstCell.startsWith('【') && firstCell.includes('ランキング')) {
      const sectionData = rawData.slice(i)
      const ranking = parseRankingSection(sectionData)
      results.push(...ranking)
    }
  }
  
  return results
}

export const mergeEvaluationData = (masterData, selfData, managerData, scoreData) => {
  const employees = {}

  selfData.forEach(item => {
    if (!employees[item.name]) {
      employees[item.name] = {
        name: item.name,
        department: item.department,
        selfAnswers: item.answers,
        managerAnswers: [],
        totalScore: 0
      }
    } else {
      employees[item.name].selfAnswers = item.answers
    }
  })

  managerData.forEach(item => {
    if (!employees[item.name]) {
      employees[item.name] = {
        name: item.name,
        department: item.department,
        selfAnswers: [],
        managerAnswers: item.answers,
        totalScore: 0
      }
    } else {
      employees[item.name].managerAnswers = item.answers
    }
  })

  scoreData.forEach(item => {
    if (employees[item.name]) {
      employees[item.name].totalScore = item.totalScore
    }
  })

  return employees
}
