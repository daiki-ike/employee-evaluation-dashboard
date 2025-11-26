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
        console.log(`Found section "${sectionName}" at row ${i}`)
        return i
      }
    }
  }
  console.log(`Section "${sectionName}" not found`)
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

  console.log(`readDataSection: found ${data.length} data rows`)
  return { headers, data }
}

// ============================================
// 売上ランキングデータの変換
// ============================================

export const convertSalesRankingData = (rawData, sheetName) => {
  console.log(`convertSalesRankingData called for sheet: ${sheetName}`)
  console.log(`Raw data rows: ${rawData?.length || 0}`)

  if (!rawData || rawData.length < 2) {
    console.log('No data to convert')
    return []
  }

  let sectionName = ''
  if (sheetName === '全体') {
    sectionName = '全体 個人ランキング'
  } else {
    sectionName = `${sheetName} 個人ランキング`
  }

  const sectionRow = findSectionRow(rawData, sectionName)
  
  if (sectionRow === -1) {
    console.log(`Section not found, trying alternative search...`)
    // フォールバック: 「個人ランキング」だけで探す
    const altSectionRow = findSectionRow(rawData, '個人ランキング')
    if (altSectionRow === -1) {
      console.log('No ranking section found')
      return []
    }
    return parseRankingSection(rawData, altSectionRow, sheetName)
  }

  return parseRankingSection(rawData, sectionRow, sheetName)
}

const parseRankingSection = (rawData, sectionRow, sheetName) => {
  const { headers, data } = readDataSection(rawData, sectionRow + 1)
  
  console.log(`Headers: ${headers.join(', ')}`)
  console.log(`Data rows: ${data.length}`)

  // ヘッダーから列インデックスを特定
  const findCol = (keywords) => {
    return headers.findIndex(h => keywords.some(k => h.includes(k)))
  }

  const rankCol = findCol(['順位'])
  const nameCol = findCol(['氏名', '名前'])
  const salesCol = findCol(['売上額', '売上高'])
  const salesShareCol = findCol(['売上全体比率', '売上比率', '部内売上比率'])
  const profitCol = findCol(['粗利額', '粗利益'])
  const profitShareCol = findCol(['粗利全体比率', '粗利比率', '部内粗利比率'])
  const profitRateCol = findCol(['粗利益率'])
  const teamCol = findCol(['所属チーム', 'チーム', '所属'])

  console.log(`Column indices - rank: ${rankCol}, name: ${nameCol}, sales: ${salesCol}, profit: ${profitCol}`)

  const results = data.map(row => {
    const rank = rankCol >= 0 ? parseNumericString(row[rankCol]) : 0
    const name = nameCol >= 0 ? String(row[nameCol] || '').trim() : ''
    const sales = salesCol >= 0 ? parseNumericString(row[salesCol]) : 0
    const salesShare = salesShareCol >= 0 ? parsePercentString(row[salesShareCol]) : 0
    const profit = profitCol >= 0 ? parseNumericString(row[profitCol]) : 0
    const profitShare = profitShareCol >= 0 ? parsePercentString(row[profitShareCol]) : 0
    const profitRate = profitRateCol >= 0 ? parsePercentString(row[profitRateCol]) : 0
    const team = teamCol >= 0 ? String(row[teamCol] || '').trim() : ''

    return {
      rank: rank,
      name: name,
      sales: sales,
      share: salesShare,  // UI互換用
      profit: profit,
      profitShare: profitShare,
      profitRate: profitRate,
      achievement: 0,  // UI互換用（データなし）
      yoy: 0,  // UI互換用（データなし）
      department: sheetName,
      team: team
    }
  }).filter(item => item.name && item.rank > 0)

  console.log(`Converted ${results.length} records for ${sheetName}`)
  if (results.length > 0) {
    console.log('First record:', results[0])
  }

  return results
}

// 複数シートから売上データを読み込む
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

    // 結果のサマリーをログ出力
    console.log('=== Sales Data Summary ===')
    console.log(`Overall: ${salesData.overall.length} records`)
    console.log(`Tokyo: ${salesData.tokyo.length} records`)
    console.log(`Osaka: ${salesData.osaka.length} records`)
    console.log(`Nagoya: ${salesData.nagoya.length} records`)
    console.log(`Hatakeyama: ${salesData.hatakeyama.length} records`)
    if (salesData.errors.length > 0) {
      console.log(`Errors: ${salesData.errors.length}`)
    }

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
