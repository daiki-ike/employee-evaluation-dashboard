// sheetsApi.js - Google Sheets API utilities

/**
 * Google Sheets の公開URLからスプレッドシートIDを抽出
 */
export const extractSpreadsheetId = (url) => {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
  return match ? match[1] : null
}

/**
 * Google Visualization API を使用してシートデータを取得
 */
export const fetchSheetData = async (spreadsheetUrl, sheetName) => {
  const spreadsheetId = extractSpreadsheetId(spreadsheetUrl)
  if (!spreadsheetId) {
    throw new Error('Invalid spreadsheet URL')
  }

  const encodedSheetName = encodeURIComponent(sheetName)
  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:json&sheet=${encodedSheetName}`
  
  console.log('[fetchSheetData] Fetching:', sheetName)
  console.log('[fetchSheetData] URL:', url)

  const response = await fetch(url)
  const text = await response.text()
  
  console.log('[fetchSheetData] Response length:', text.length, 'chars')
  
  // Google Visualization API のレスポンスをパース
  const jsonMatch = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\);?$/)
  if (!jsonMatch) {
    throw new Error('Failed to parse Google Sheets response')
  }
  
  const json = JSON.parse(jsonMatch[1])
  
  if (json.status === 'error') {
    throw new Error(json.errors?.[0]?.detailed_message || 'Unknown error')
  }
  
  const table = json.table
  console.log('[fetchSheetData] Columns:', table.cols?.length)
  console.log('[fetchSheetData] Total rows from API:', table.rows?.length)
  
  // データを2次元配列に変換
  const data = table.rows.map(row => 
    row.c.map(cell => {
      if (!cell) return null
      // フォーマット済みの値があればそれを使用、なければ生の値
      return cell.f !== undefined ? cell.f : cell.v
    })
  )
  
  if (data.length > 0) {
    console.log('[fetchSheetData] First row raw:', JSON.stringify(table.rows[0].c.slice(0, 8)))
  }
  console.log(`[fetchSheetData] ${sheetName}: ${data.length} rows converted`)
  if (data.length > 0) {
    console.log('[fetchSheetData] First row converted:', data[0])
  }
  
  return data
}

/**
 * 金額文字列をパース（¥1,234,567 → 1234567）
 */
const parseAmount = (value) => {
  if (value === null || value === undefined) return 0
  if (typeof value === 'number') return value
  const str = String(value).replace(/[¥￥,\s]/g, '')
  return parseInt(str) || 0
}

/**
 * パーセント文字列をパース（12.34% → 12.34）
 */
const parsePercent = (value) => {
  if (value === null || value === undefined) return 0
  if (typeof value === 'number') return value * 100
  const str = String(value).replace(/[%\s]/g, '')
  return parseFloat(str) || 0
}

/**
 * 評価マスターデータを取得
 */
export const fetchMasterData = async (spreadsheetUrl, sheetName) => {
  const data = await fetchSheetData(spreadsheetUrl, sheetName)
  
  // ヘッダー行をスキップしてデータを返す
  return data.slice(1).map(row => ({
    id: row[0],
    name: row[1],
    department: row[2],
    position: row[3],
    role: row[4]
  }))
}

/**
 * 評価データを取得
 */
export const fetchEvaluationData = async (spreadsheetUrl, sheetName, type = 'raw') => {
  const rawData = await fetchSheetData(spreadsheetUrl, sheetName)
  
  if (type === 'raw') {
    return rawData
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
    tokyo: { teamSummary: [], departments: [] },
    osaka: { teamSummary: [], departments: [] },
    nagoya: { teamSummary: [], departments: [] },
    kikakukaihatsu: { teamSummary: [], departments: [] }
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
      
      const key = sheetMapping[sheetName] || sheetName.toLowerCase()
      
      if (sheetName === '全体') {
        // 全体シートは従来通りのパース
        const rankings = parseRankingByHeader(data)
        result.overall = rankings
        console.log(`[fetchAllSalesSheets] 全体: ${rankings.length} total records`)
      } else {
        // 他のシートはチーム別サマリー + 部門別ランキング
        const parsed = parseSheetWithDepartments(data, sheetName)
        result[key] = parsed
        console.log(`[fetchAllSalesSheets] ${sheetName}: teamSummary=${parsed.teamSummary.length}, departments=${parsed.departments.length}`)
      }
    } catch (error) {
      console.error(`[fetchAllSalesSheets] Error fetching ${sheetName}:`, error)
    }
  }

  console.log('[fetchAllSalesSheets] Complete')
  console.log('[fetchAllSalesSheets] Result summary:', {
    overall: result.overall.length,
    tokyo: `${result.tokyo.teamSummary.length} teams, ${result.tokyo.departments.length} depts`,
    osaka: `${result.osaka.teamSummary.length} teams, ${result.osaka.departments.length} depts`,
    nagoya: `${result.nagoya.teamSummary.length} teams, ${result.nagoya.departments.length} depts`,
    kikakukaihatsu: `${result.kikakukaihatsu.teamSummary.length} teams, ${result.kikakukaihatsu.departments.length} depts`
  })
  return result
}

/**
 * シートをチーム別サマリーと部門別ランキングに分けてパース
 */
const parseSheetWithDepartments = (data, sheetName) => {
  console.log(`[parseSheetWithDepartments] Parsing ${sheetName}...`)
  
  const result = {
    teamSummary: [],
    departments: []
  }
  
  let currentSection = null
  let currentDeptName = null
  let headerRow = null
  let sectionData = []
  
  for (let i = 0; i < data.length; i++) {
    const row = data[i]
    if (!row) continue
    
    const firstCell = String(row[0] || '').trim()
    
    // 【】で囲まれたセクションタイトルを検出
    if (firstCell.startsWith('【') && firstCell.includes('】')) {
      // 前のセクションを処理
      if (currentSection && headerRow && sectionData.length > 0) {
        processSection(result, currentSection, currentDeptName, headerRow, sectionData, sheetName)
      }
      
      // 新しいセクションを開始
      currentSection = firstCell
      currentDeptName = extractDeptName(firstCell, sheetName)
      headerRow = null
      sectionData = []
      console.log(`[parseSheetWithDepartments] Found section: ${firstCell} -> dept: ${currentDeptName}`)
      continue
    }
    
    // ヘッダー行を検出（「順位」または「チーム」を含む行）
    const hasRankOrTeam = row.some(cell => {
      const s = String(cell || '')
      return s.includes('順位') || s.includes('チーム') || s.includes('氏名')
    })
    
    if (hasRankOrTeam && !headerRow) {
      headerRow = row
      console.log(`[parseSheetWithDepartments] Header at row ${i}:`, row.slice(0, 6))
      continue
    }
    
    // データ行を収集
    if (headerRow && row[0] !== null && row[0] !== undefined && row[0] !== '') {
      // 「合計」行はスキップ
      if (String(row[0]).includes('合計')) continue
      sectionData.push(row)
    }
  }
  
  // 最後のセクションを処理
  if (currentSection && headerRow && sectionData.length > 0) {
    processSection(result, currentSection, currentDeptName, headerRow, sectionData, sheetName)
  }
  
  console.log(`[parseSheetWithDepartments] ${sheetName} complete: ${result.teamSummary.length} teams, ${result.departments.length} departments`)
  return result
}

/**
 * セクションタイトルから部門名を抽出
 */
const extractDeptName = (sectionTitle, sheetName) => {
  // 【東京チーム別サマリー】→ null (サマリー)
  // 【東京マネジメント個人ランキング】→ マネジメント
  // 【東京 制作1個人ランキング】→ 制作1
  
  if (sectionTitle.includes('サマリー')) {
    return null // チーム別サマリー
  }
  
  // 地域名を除去
  const regions = ['東京', '大阪', '名古屋', '企画開発']
  let title = sectionTitle.replace(/【|】/g, '')
  for (const region of regions) {
    title = title.replace(region, '')
  }
  
  // 「個人ランキング」を除去
  title = title.replace('個人ランキング', '').trim()
  
  return title || 'その他'
}

/**
 * セクションデータを処理してresultに追加
 */
const processSection = (result, sectionTitle, deptName, headerRow, dataRows, sheetName) => {
  console.log(`[processSection] Processing: ${sectionTitle}, deptName: ${deptName}, rows: ${dataRows.length}`)
  
  if (sectionTitle.includes('サマリー')) {
    // チーム別サマリー
    // 構造: 順位、チーム、売上高、支払高、粗利益、粗利益率、支社内売上比率、支社内粗利比率
    const teamData = dataRows.map((row, idx) => ({
      rank: parseInt(row[0]) || idx + 1,
      team: String(row[1] || '').trim(),
      sales: parseAmount(row[2]),
      expense: parseAmount(row[3]),
      profit: parseAmount(row[4]),
      profitRate: parsePercent(row[5]),
      salesRatio: parsePercent(row[6]),
      profitRatio: parsePercent(row[7])
    })).filter(item => item.team && item.team !== '-')
    
    result.teamSummary = teamData
    console.log(`[processSection] TeamSummary: ${teamData.length} teams`)
  } else {
    // 部門別個人ランキング
    // 構造: 順位、氏名、所属チーム、売上額、部内売上比率、粗利額、部内粗利比率、粗利益率
    const rankings = dataRows.map((row, idx) => ({
      rank: parseInt(row[0]) || idx + 1,
      name: String(row[1] || '').trim(),
      team: String(row[2] || '').trim(),
      sales: parseAmount(row[3]),
      salesRatio: parsePercent(row[4]),
      profit: parseAmount(row[5]),
      profitRatio: parsePercent(row[6]),
      profitRate: parsePercent(row[7])
    })).filter(item => item.name && item.name !== '氏名')
    
    if (rankings.length > 0) {
      result.departments.push({
        name: deptName,
        rankings: rankings
      })
      console.log(`[processSection] Department ${deptName}: ${rankings.length} people`)
    }
  }
}

/**
 * ヘッダー行を探してランキングデータをパース（全体シート用）
 */
const parseRankingByHeader = (data) => {
  console.log('[parseRankingByHeader] Starting... data length:', data.length)
  
  const allResults = []
  
  for (let i = 0; i < data.length; i++) {
    const row = data[i]
    if (!row) continue
    
    // 「氏名」を含む行をヘッダーとして検出
    const hasName = row.some(cell => String(cell || '').includes('氏名'))
    const hasTeamOrSales = row.some(cell => {
      const s = String(cell || '')
      return s.includes('所属') || s.includes('チーム') || s.includes('売上')
    })
    
    if (hasName && hasTeamOrSales) {
      console.log(`[parseRankingByHeader] Found header at row ${i}:`, row.slice(0, 8))
      
      const headers = row
      
      // 固定インデックスを使用
      // 全体シート構造: 順位(0), 氏名(1), 所属チーム(2), 売上額(3), 売上比率(4), 粗利額(5), 粗利比率(6), 粗利益率(7)
      const colRank = 0
      const colName = 1
      const colTeam = 2
      const colSales = 3
      const colSalesRatio = 4
      const colProfit = 5
      const colProfitRatio = 6
      const colProfitRate = 7
      
      // ヘッダーの次の行からデータを読み取る
      for (let j = i + 1; j < data.length; j++) {
        const dataRow = data[j]
        if (!dataRow) continue
        
        // 次のヘッダー行に到達したら終了
        const isNextHeader = dataRow.some(cell => String(cell || '').includes('氏名'))
        if (isNextHeader && j > i + 1) {
          break
        }
        
        // 名前が空ならスキップ
        const name = String(dataRow[colName] || '').trim()
        if (!name) continue
        if (name === '氏名' || name === '名前' || /^\d+$/.test(name)) continue
        
        let rank = parseInt(dataRow[colRank]) || 0
        if (rank === 0) {
          rank = allResults.length + 1
        }
        
        const entry = {
          rank: rank,
          name: name,
          team: String(dataRow[colTeam] || '').trim(),
          sales: parseAmount(dataRow[colSales]),
          salesRatio: parsePercent(dataRow[colSalesRatio]),
          profit: parseAmount(dataRow[colProfit]),
          profitRatio: parsePercent(dataRow[colProfitRatio]),
          profitRate: parsePercent(dataRow[colProfitRate])
        }
        
        allResults.push(entry)
      }
    }
  }
  
  console.log(`[parseRankingByHeader] Total parsed: ${allResults.length} records`)
  return allResults
}

/**
 * ローカルストレージから売上ランキングデータを取得
 */
export const getSalesRankingFromStorage = () => {
  const stored = localStorage.getItem('salesRanking')
  if (!stored) return null
  try {
    return JSON.parse(stored)
  } catch {
    return null
  }
}

/**
 * 売上ランキングデータをローカルストレージに保存
 */
export const saveSalesRankingToStorage = (data) => {
  localStorage.setItem('salesRanking', JSON.stringify(data))
}

/**
 * 評価マスターデータをローカルストレージに保存
 */
export const saveMasterDataToStorage = (data) => {
  localStorage.setItem('masterData', JSON.stringify(data))
}

/**
 * 評価マスターデータをローカルストレージから取得
 */
export const getMasterDataFromStorage = () => {
  const stored = localStorage.getItem('masterData')
  if (!stored) return null
  try {
    return JSON.parse(stored)
  } catch {
    return null
  }
}

/**
 * 評価データをローカルストレージに保存
 */
export const saveEvaluationDataToStorage = (data) => {
  localStorage.setItem('evaluationData', JSON.stringify(data))
}

/**
 * 評価データをローカルストレージから取得
 */
export const getEvaluationDataFromStorage = () => {
  const stored = localStorage.getItem('evaluationData')
  if (!stored) return null
  try {
    return JSON.parse(stored)
  } catch {
    return null
  }
}

/**
 * 評価文字列を数値に変換
 */
export const convertEvaluationToNumber = (evaluation) => {
  const mapping = {
    'S': 5,
    'A': 4,
    'B': 3,
    'C': 2,
    'D': 1,
    '': 0,
    null: 0,
    undefined: 0
  }
  return mapping[evaluation] !== undefined ? mapping[evaluation] : 0
}

/**
 * 生データを構造化データに変換
 */
export const convertToStructuredData = (rawData, type) => {
  if (!rawData || rawData.length === 0) return []
  
  if (type === 'master') {
    return rawData.slice(1).map(row => ({
      id: row[0],
      name: row[1],
      department: row[2],
      position: row[3],
      role: row[4]
    }))
  }
  
  if (type === 'evaluation') {
    return rawData
  }
  
  return rawData
}

/**
 * 評価データをマージ
 */
export const mergeEvaluationData = (existingData, newData) => {
  if (!existingData || existingData.length === 0) return newData
  if (!newData || newData.length === 0) return existingData
  
  // 新しいデータで既存データを上書き
  const merged = [...existingData]
  
  newData.forEach(newRow => {
    const existingIndex = merged.findIndex(row => row[0] === newRow[0])
    if (existingIndex >= 0) {
      merged[existingIndex] = newRow
    } else {
      merged.push(newRow)
    }
  })
  
  return merged
}
