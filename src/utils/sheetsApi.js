// Google Sheets APIを使ってデータを取得する関数

export const fetchSheetData = async (spreadsheetUrl, sheetName, range = '') => {
  try {
    const spreadsheetId = extractSpreadsheetId(spreadsheetUrl)

    if (!spreadsheetId) {
      throw new Error('無効なスプレッドシートURLです')
    }

    const apiUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(sheetName)}`

    const response = await fetch(apiUrl)
    const text = await response.text()

    const jsonString = text.substring(47, text.length - 2)
    const data = JSON.parse(jsonString)

    const parsedData = parseGoogleSheetsData(data)

    console.log(`fetchSheetData - ${sheetName}: got ${parsedData.length} rows`)

    return parsedData
  } catch (error) {
    console.error('Error fetching sheet data:', error)
    throw error
  }
}

const extractSpreadsheetId = (url) => {
  const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/)
  return match ? match[1] : null
}

const parseGoogleSheetsData = (data) => {
  if (!data.table || !data.table.rows) {
    return []
  }

  const rows = data.table.rows
  const parsedData = []

  rows.forEach(row => {
    if (row.c) {
      const rowData = row.c.map(cell => {
        if (!cell) return null
        return cell.v !== null ? cell.v : null
      })
      parsedData.push(rowData)
    }
  })

  return parsedData
}

// ============================================
// ヘルパー関数
// ============================================

const parseNumericString = (str) => {
  if (typeof str === 'number') return str
  if (!str) return 0
  const cleanStr = str.toString().replace(/[¥￥,%％\s　]/g, '')
  const num = parseFloat(cleanStr)
  return isNaN(num) ? 0 : num
}

const parsePercentString = (str) => {
  if (typeof str === 'number') return str
  if (!str) return 0
  const cleanStr = str.toString().replace(/[%％\s]/g, '')
  const num = parseFloat(cleanStr)
  return isNaN(num) ? 0 : num
}

// セクションタイトル（【】）を探す
const findSectionRow = (rawData, sectionName) => {
  for (let i = 0; i < rawData.length; i++) {
    const row = rawData[i]
    if (!row) continue
    for (let j = 0; j < row.length; j++) {
      const cell = String(row[j] || '').trim()
      if (cell.includes(sectionName)) {
        return i
      }
    }
  }
  return -1
}

// ヘッダー行からデータを読み取る（空行まで）
const readDataSection = (rawData, headerRowIndex) => {
  const headerRow = rawData[headerRowIndex]
  if (!headerRow) return { headers: [], data: [] }

  const headers = headerRow.map(cell => String(cell || '').trim())
  const data = []

  for (let i = headerRowIndex + 1; i < rawData.length; i++) {
    const row = rawData[i]
    if (!row) break

    // 空行チェック（全てのセルが空かnull）
    const isEmpty = row.every(cell => cell === null || cell === '' || cell === undefined)
    if (isEmpty) break

    // セクションタイトルが来たら終了
    const firstCell = String(row[0] || '').trim()
    if (firstCell.startsWith('【') || firstCell.startsWith('■')) break

    data.push(row)
  }

  return { headers, data }
}

// ============================================
// 新フォーマット用のデータ変換関数
// ============================================

// 部門サマリーを読み取る
const parseDepartmentSummary = (rawData) => {
  const sectionRow = findSectionRow(rawData, '部門別サマリー')
  if (sectionRow === -1) return []

  const { headers, data } = readDataSection(rawData, sectionRow + 1)

  return data.map(row => ({
    department: String(row[0] || '').trim(),
    sales: parseNumericString(row[1]),
    expenses: parseNumericString(row[2]),
    profit: parseNumericString(row[3]),
    profitRate: parsePercentString(row[4]),
    salesShareTotal: parsePercentString(row[5]),
    profitShareTotal: parsePercentString(row[6])
  })).filter(item => item.department && item.department !== '合計')
}

// 個人ランキングを読み取る（全体シート用）
const parseOverallPersonalRanking = (rawData) => {
  const sectionRow = findSectionRow(rawData, '全体 個人ランキング')
  if (sectionRow === -1) return []

  const { headers, data } = readDataSection(rawData, sectionRow + 1)

  return data.map(row => ({
    rank: parseNumericString(row[0]),
    name: String(row[1] || '').trim(),
    sales: parseNumericString(row[2]),
    salesShare: parsePercentString(row[3]),
    profit: parseNumericString(row[4]),
    profitShare: parsePercentString(row[5]),
    profitRate: parsePercentString(row[6]),
    department: '全体'
  })).filter(item => item.name && item.rank > 0)
}

// 部門シートのサマリーを読み取る
const parseDeptSheetSummary = (rawData, deptName) => {
  const sectionRow = findSectionRow(rawData, `${deptName} サマリー`)
  if (sectionRow === -1) return null

  const { headers, data } = readDataSection(rawData, sectionRow + 1)

  const summary = {}
  data.forEach(row => {
    const item = String(row[0] || '').trim()
    const value = row[1]
    if (item === '売上高') summary.sales = parseNumericString(value)
    if (item === '支払高') summary.expenses = parseNumericString(value)
    if (item === '粗利益') summary.profit = parseNumericString(value)
    if (item === '粗利益率') summary.profitRate = parsePercentString(value)
    if (item === '全体売上比率') summary.salesShareTotal = parsePercentString(value)
    if (item === '全体粗利比率') summary.profitShareTotal = parsePercentString(value)
  })

  return summary
}

// チーム別サマリーを読み取る
const parseTeamSummary = (rawData, deptName) => {
  const sectionRow = findSectionRow(rawData, `${deptName} チーム別サマリー`)
  if (sectionRow === -1) return []

  const { headers, data } = readDataSection(rawData, sectionRow + 1)

  return data.map(row => ({
    team: String(row[0] || '').trim(),
    sales: parseNumericString(row[1]),
    expenses: parseNumericString(row[2]),
    profit: parseNumericString(row[3]),
    profitRate: parsePercentString(row[4]),
    salesShareDept: parsePercentString(row[5]),
    profitShareDept: parsePercentString(row[6])
  })).filter(item => item.team && item.team !== '合計')
}

// 部門シートの個人ランキングを読み取る
const parseDeptPersonalRanking = (rawData, deptName) => {
  const sectionRow = findSectionRow(rawData, `${deptName} 個人ランキング`)
  if (sectionRow === -1) return []

  const { headers, data } = readDataSection(rawData, sectionRow + 1)

  // ヘッダーから所属チーム列があるか判定
  const hasTeamColumn = headers.some(h => h.includes('所属') || h.includes('チーム'))

  return data.map(row => {
    if (hasTeamColumn) {
      return {
        rank: parseNumericString(row[0]),
        name: String(row[1] || '').trim(),
        team: String(row[2] || '').trim(),
        sales: parseNumericString(row[3]),
        salesShare: parsePercentString(row[4]),
        profit: parseNumericString(row[5]),
        profitShare: parsePercentString(row[6]),
        profitRate: parsePercentString(row[7]),
        department: deptName
      }
    } else {
      return {
        rank: parseNumericString(row[0]),
        name: String(row[1] || '').trim(),
        team: '',
        sales: parseNumericString(row[2]),
        salesShare: parsePercentString(row[3]),
        profit: parseNumericString(row[4]),
        profitShare: parsePercentString(row[5]),
        profitRate: parsePercentString(row[6]),
        department: deptName
      }
    }
  }).filter(item => item.name && item.rank > 0)
}

// ============================================
// メインの読み込み関数
// ============================================

export const fetchAllSalesData = async (spreadsheetUrl) => {
  const sheetNames = ['全体', '東京', '大阪', '名古屋', '畠山部']

  try {
    const result = {
      departmentSummary: [],
      overallRanking: [],
      departments: {},
      errors: []
    }

    // 各シートを読み込み
    for (const sheetName of sheetNames) {
      try {
        const rawData = await fetchSheetData(spreadsheetUrl, sheetName)
        console.log(`Processing sheet: ${sheetName}`)

        if (sheetName === '全体') {
          // 部門サマリー
          result.departmentSummary = parseDepartmentSummary(rawData)
          console.log(`  - Department summary: ${result.departmentSummary.length} items`)

          // 全体個人ランキング
          result.overallRanking = parseOverallPersonalRanking(rawData)
          console.log(`  - Overall ranking: ${result.overallRanking.length} items`)
        } else {
          // 部門シート
          const deptData = {
            summary: parseDeptSheetSummary(rawData, sheetName),
            teams: parseTeamSummary(rawData, sheetName),
            ranking: parseDeptPersonalRanking(rawData, sheetName)
          }

          result.departments[sheetName] = deptData
          console.log(`  - Summary: ${deptData.summary ? 'OK' : 'Not found'}`)
          console.log(`  - Teams: ${deptData.teams.length} items`)
          console.log(`  - Ranking: ${deptData.ranking.length} items`)
        }
      } catch (error) {
        console.error(`Error processing ${sheetName}:`, error)
        result.errors.push({ sheet: sheetName, error: error.message })
      }
    }

    return result
  } catch (error) {
    console.error('Error fetching all sales data:', error)
    throw error
  }
}

// 旧フォーマット互換用（既存コードとの互換性のため）
export const convertSalesRankingData = (rawData, sheetName) => {
  console.log(`convertSalesRankingData called for sheet: ${sheetName}`)
  
  if (sheetName === '全体') {
    return parseOverallPersonalRanking(rawData)
  } else {
    return parseDeptPersonalRanking(rawData, sheetName)
  }
}

export const fetchAllSalesSheets = async (spreadsheetUrl) => {
  const sheetNames = ['全体', '東京', '大阪', '名古屋', '畠山部']

  try {
    const results = await Promise.all(
      sheetNames.map(async (sheetName) => {
        try {
          const rawData = await fetchSheetData(spreadsheetUrl, sheetName)
          const convertedData = convertSalesRankingData(rawData, sheetName)
          return { sheetName, data: convertedData, success: true }
        } catch (error) {
          console.error(`Error fetching ${sheetName}:`, error)
          return { sheetName, data: [], success: false, error: error.message }
        }
      })
    )

    const salesData = {
      overall: [],
      tokyo: [],
      osaka: [],
      nagoya: [],
      hatakeyama: [],
      errors: []
    }

    results.forEach(result => {
      if (result.success) {
        switch (result.sheetName) {
          case '全体':
            salesData.overall = result.data
            break
          case '東京':
            salesData.tokyo = result.data
            break
          case '大阪':
            salesData.osaka = result.data
            break
          case '名古屋':
            salesData.nagoya = result.data
            break
          case '畠山部':
            salesData.hatakeyama = result.data
            break
        }
      } else {
        salesData.errors.push({
          sheet: result.sheetName,
          error: result.error
        })
      }
    })

    return salesData
  } catch (error) {
    console.error('Error fetching all sales sheets:', error)
    throw error
  }
}

// ============================================
// 評価関連の関数（既存のまま）
// ============================================

export const convertEvaluationToNumber = (text) => {
  if (!text) return 0

  const textStr = String(text).trim()

  if (textStr === '出来ていた') return 1.0
  if (textStr === 'やや出来ていた') return 0.7
  if (textStr === 'やや出来ていない') return 0.3
  if (textStr === '出来なかった') return 0.0
  if (textStr === '対象外') return 0.0
  if (textStr === '管理部門対象外') return 0.0

  return 0
}

export const convertToStructuredData = (rawData, type) => {
  if (!rawData || rawData.length === 0) {
    return []
  }

  console.log(`convertToStructuredData - type: ${type}, rawData length: ${rawData.length}`)

  if (type === 'sales') {
    const headers = rawData[0]
    return rawData.slice(1).map(row => ({
      name: row[0],
      department: row[1],
      year: row[2],
      sales: parseFloat(row[3]) || 0,
      profit: parseFloat(row[4]) || 0
    }))
  } else if (type === 'evaluationMaster') {
    if (rawData.length < 2) return []

    const headers = rawData[0].map(h => String(h).trim())

    const findIndex = (keywords) => headers.findIndex(h => keywords.some(k => h.includes(k)))

    const idx = {
      categoryNo: findIndex(['大項目番号', 'No', 'CategoryNo']),
      major: findIndex(['大項目', '大カテゴリ', 'Major']),
      minor: findIndex(['中項目', '中カテゴリ', 'Minor']),
      criteria: findIndex(['審査内容', '評価基準', '内容', 'Criteria']),
      questionNo: findIndex(['設問番号', '質問番号', 'QuestionNo', 'No.'])
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
