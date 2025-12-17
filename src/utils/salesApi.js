// salesApi.js - Sales Dashboard API utilities (評価シートとは完全に独立)

/**
 * Google Sheets の公開URLからスプレッドシートIDを抽出
 */
const extractSpreadsheetId = (url) => {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
  return match ? match[1] : null
}

/**
 * Google Visualization API を使用してシートデータを取得
 */
const fetchSheetData = async (spreadsheetUrl, sheetName) => {
  const spreadsheetId = extractSpreadsheetId(spreadsheetUrl)
  if (!spreadsheetId) {
    throw new Error('Invalid spreadsheet URL')
  }

  const encodedSheetName = encodeURIComponent(sheetName)
  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:json&sheet=${encodedSheetName}`

  console.log('[salesApi] Fetching:', sheetName)

  const response = await fetch(url)
  const text = await response.text()

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
  console.log(`[salesApi] ${sheetName}: ${table.rows?.length} rows`)

  // データを2次元配列に変換
  const data = table.rows.map(row =>
    row.c.map(cell => {
      if (!cell) return null
      return cell.f !== undefined ? cell.f : cell.v
    })
  )

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
 * 全シートから売上データを取得
 */
export const fetchAllSalesSheets = async (spreadsheetUrl, sheetNames = ['全体', '東京', '大阪', '名古屋', '企画開発']) => {
  console.log('[salesApi] fetchAllSalesSheets Starting...')

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
      console.log(`[salesApi] Fetching sheet: ${sheetName}`)
      const data = await fetchSheetData(spreadsheetUrl, sheetName)

      const key = sheetMapping[sheetName] || sheetName.toLowerCase()

      if (sheetName === '全体') {
        const rankings = parseRankingByHeader(data)
        result.overall = rankings
        console.log(`[salesApi] 全体: ${rankings.length} total records`)
      } else {
        const parsed = parseSheetWithDepartments(data, sheetName)
        result[key] = parsed
        console.log(`[salesApi] ${sheetName}: teamSummary=${parsed.teamSummary.length}, departments=${parsed.departments.length}`)
      }
    } catch (error) {
      console.error(`[salesApi] Error fetching ${sheetName}:`, error)
    }
  }

  console.log('[salesApi] fetchAllSalesSheets Complete')
  return result
}

/**
 * シートをチーム別サマリーと部門別ランキングに分けてパース
 */
const parseSheetWithDepartments = (data, sheetName) => {
  console.log(`[salesApi] Parsing ${sheetName}... rows: ${data.length}`)

  const result = {
    teamSummary: [],
    departments: []
  }

  let currentSection = null
  let headerRow = null
  let headerRowIndex = -1
  let currentDepartmentName = null
  let columnMap = {}
  const departmentMap = {}

  const isEmptyRow = (row) => {
    if (!row) return true
    return row.every(cell => cell === null || cell === undefined || String(cell).trim() === '')
  }

  const isSectionTitleRow = (row) => {
    if (!row) return false
    for (const cell of row) {
      const cellStr = String(cell || '').trim()
      if (cellStr.startsWith('【') && cellStr.includes('】')) {
        return true
      }
    }
    return false
  }

  const getSectionTitle = (row) => {
    if (!row) return null
    for (const cell of row) {
      const cellStr = String(cell || '').trim()
      if (cellStr.startsWith('【') && cellStr.includes('】')) {
        return cellStr
      }
    }
    return null
  }

  const extractDepartmentFromTitle = (title) => {
    const match = title.match(/【(.+?)個人ランキング】/)
    if (!match) return null

    let content = match[1].trim()

    if (sheetName === '企画開発') {
      return content
    }

    const regions = ['東京', '大阪', '名古屋', '企画開発']
    let usedRegion = null

    for (const region of regions) {
      if (content.startsWith(region)) {
        usedRegion = region
        content = content.substring(region.length)
        break
      }
    }

    content = content.replace(/^[\s　]+/, '').trim()

    if (!content && usedRegion) {
      return usedRegion
    }

    return content || null
  }

  for (let i = 0; i < data.length; i++) {
    const row = data[i]

    if (isEmptyRow(row)) {
      currentSection = null
      headerRow = null
      headerRowIndex = -1
      continue
    }

    if (isSectionTitleRow(row)) {
      const title = getSectionTitle(row)
      console.log(`[salesApi] Found section title: ${title}`)

      if (title && title.includes('チーム別サマリー')) {
        currentSection = 'teamSummary'
        currentDepartmentName = null
        headerRow = null
        headerRowIndex = -1
      } else if (title && title.includes('個人ランキング')) {
        currentSection = 'ranking'
        headerRow = null
        headerRowIndex = -1
        const deptName = extractDepartmentFromTitle(title)
        if (deptName) {
          currentDepartmentName = deptName
        }
      }
      continue
    }

    const firstCellVal = String(row[0] || '').trim()
    const secondCellVal = String(row[1] || '').trim()
    const thirdCellVal = String(row[2] || '').trim()
    const fourthCellVal = String(row[3] || '').trim()
    const isFirstCellNumeric = !isNaN(parseInt(firstCellVal)) && parseInt(firstCellVal) > 0

    if (!currentSection && isFirstCellNumeric) {
      const isThirdColAmount = thirdCellVal.includes('¥') ||
                               /^[\d,]+$/.test(thirdCellVal.replace(/[¥￥]/g, '')) ||
                               (parseInt(thirdCellVal.replace(/[¥￥,]/g, '')) > 100000)
      const isFourthColAmount = fourthCellVal.includes('¥') ||
                                /^[\d,]+$/.test(fourthCellVal.replace(/[¥￥]/g, '')) ||
                                (parseInt(fourthCellVal.replace(/[¥￥,]/g, '')) > 100000)

      if (isThirdColAmount) {
        currentSection = 'teamSummary'
        headerRow = 'auto'
        headerRowIndex = i - 1
        console.log(`[salesApi] Auto-detected teamSummary at row ${i}`)
      } else if (!isThirdColAmount && isFourthColAmount) {
        currentSection = 'ranking'
        headerRow = 'auto'
        headerRowIndex = i - 1
        columnMap = { rank: 0, name: 1, team: 2, sales: 3, salesRatio: 4, profit: 5, profitRatio: 6, profitRate: 7 }
        console.log(`[salesApi] Auto-detected ranking at row ${i}`)
      }
    }

    if (currentSection && !headerRow) {
      const firstCellStr = String(row[0] || '').trim()
      if (isNaN(parseInt(firstCellStr))) {
        headerRow = row
        headerRowIndex = i

        if (currentSection === 'ranking') {
          columnMap = {}
          row.forEach((cell, idx) => {
            const cellStr = String(cell || '').trim()
            if (cellStr.includes('順位')) columnMap.rank = idx
            if (cellStr === '氏名') columnMap.name = idx
            if (cellStr.includes('所属') || cellStr === '所属チーム') columnMap.team = idx
            if (cellStr === '売上額' || cellStr.includes('売上額') || cellStr.includes('売上')) columnMap.sales = idx
            if (cellStr.includes('部内売上比率') || cellStr.includes('売上比率')) columnMap.salesRatio = idx
            if (cellStr === '粗利額' || cellStr.includes('粗利額') || cellStr.includes('粗利益')) columnMap.profit = idx
            if (cellStr.includes('部内粗利比率') || cellStr.includes('粗利比率')) columnMap.profitRatio = idx
            if (cellStr === '粗利益率' || cellStr.includes('粗利益率')) columnMap.profitRate = idx
          })

          if (columnMap.name !== undefined && columnMap.sales === undefined) {
            const nameIdx = columnMap.name
            if (columnMap.team === undefined) columnMap.team = nameIdx + 1
            columnMap.sales = columnMap.team !== undefined ? columnMap.team + 1 : nameIdx + 2
            columnMap.salesRatio = columnMap.sales + 1
            columnMap.profit = columnMap.salesRatio + 1
            columnMap.profitRatio = columnMap.profit + 1
            columnMap.profitRate = columnMap.profitRatio + 1
          }
        }
        continue
      }
    }

    const hasTeamHeader = row.some(cell => String(cell || '').trim() === 'チーム')
    const hasNameHeader = row.some(cell => String(cell || '').trim() === '氏名')
    const hasRankHeader = row.some(cell => String(cell || '').includes('順位'))
    const hasBelongTeamHeader = row.some(cell => String(cell || '').includes('所属'))
    const hasSalesHeader = row.some(cell => String(cell || '').includes('売上'))

    let nextRowIsData = false
    if (i + 1 < data.length) {
      const nextRow = data[i + 1]
      if (nextRow) {
        const nextFirstCell = String(nextRow[0] || '').trim()
        nextRowIsData = !isNaN(parseInt(nextFirstCell)) && parseInt(nextFirstCell) > 0
      }
    }

    const isHeader = (hasRankHeader && (hasTeamHeader || hasNameHeader)) ||
                     (hasNameHeader && hasSalesHeader) ||
                     (hasTeamHeader && hasSalesHeader && !hasNameHeader) ||
                     (hasNameHeader && hasBelongTeamHeader) ||
                     (nextRowIsData && isNaN(parseInt(firstCellVal)) && (hasTeamHeader || hasNameHeader || secondCellVal))

    if (isHeader) {
      let detectedSection = null

      if (hasTeamHeader && !hasNameHeader && !hasBelongTeamHeader) {
        detectedSection = 'teamSummary'
      } else if (hasNameHeader) {
        detectedSection = 'ranking'
      }

      if (detectedSection === 'teamSummary') {
        currentSection = 'teamSummary'
        currentDepartmentName = null
      } else if (detectedSection === 'ranking') {
        currentSection = 'ranking'

        columnMap = {}
        row.forEach((cell, idx) => {
          const cellStr = String(cell || '').trim()
          if (cellStr.includes('順位')) columnMap.rank = idx
          if (cellStr === '氏名') columnMap.name = idx
          if (cellStr.includes('所属') || cellStr === '所属チーム') columnMap.team = idx
          if (cellStr === '売上額' || cellStr.includes('売上額') || cellStr.includes('売上')) columnMap.sales = idx
          if (cellStr.includes('部内売上比率') || cellStr.includes('売上比率')) columnMap.salesRatio = idx
          if (cellStr === '粗利額' || cellStr.includes('粗利額') || cellStr.includes('粗利益')) columnMap.profit = idx
          if (cellStr.includes('部内粗利比率') || cellStr.includes('粗利比率')) columnMap.profitRatio = idx
          if (cellStr === '粗利益率' || cellStr.includes('粗利益率')) columnMap.profitRate = idx
        })

        if (columnMap.name !== undefined && columnMap.sales === undefined) {
          const nameIdx = columnMap.name
          if (columnMap.team === undefined) columnMap.team = nameIdx + 1
          columnMap.sales = columnMap.team !== undefined ? columnMap.team + 1 : nameIdx + 2
          columnMap.salesRatio = columnMap.sales + 1
          columnMap.profit = columnMap.salesRatio + 1
          columnMap.profitRatio = columnMap.profit + 1
          columnMap.profitRate = columnMap.profitRatio + 1
        }
      }
      headerRow = row
      headerRowIndex = i
      continue
    }

    if (headerRow && i > headerRowIndex) {
      const firstCell = row[0]
      const firstCellStr = String(firstCell || '').trim()

      if (firstCell === null || firstCell === undefined || firstCellStr === '' ||
          firstCellStr.includes('合計') || firstCellStr.startsWith('【')) {
        continue
      }

      if (row.some(cell => String(cell || '').trim() === '氏名') ||
          (row.some(cell => String(cell || '').trim() === 'チーム') && row.some(cell => String(cell || '').includes('順位')))) {
        headerRow = null
        headerRowIndex = -1
        i--
        continue
      }

      const rankValue = parseInt(firstCellStr)
      if (isNaN(rankValue)) {
        continue
      }

      if (currentSection === 'teamSummary') {
        const team = {
          rank: rankValue || result.teamSummary.length + 1,
          team: String(row[1] || '').trim(),
          sales: parseAmount(row[2]),
          expense: parseAmount(row[3]),
          profit: parseAmount(row[4]),
          profitRate: parsePercent(row[5]),
          salesRatio: parsePercent(row[6]),
          profitRatio: parsePercent(row[7])
        }
        if (team.team && team.team !== '-') {
          result.teamSummary.push(team)
          console.log(`[salesApi] TeamSummary: ${team.team}, sales=${team.sales}`)
        }
      } else if (currentSection === 'ranking') {
        const belongTeam = columnMap.team !== undefined ? String(row[columnMap.team] || '').trim() : ''
        const person = {
          rank: rankValue || 1,
          name: columnMap.name !== undefined ? String(row[columnMap.name] || '').trim() : String(row[1] || '').trim(),
          team: belongTeam,
          sales: columnMap.sales !== undefined ? parseAmount(row[columnMap.sales]) : 0,
          salesRatio: columnMap.salesRatio !== undefined ? parsePercent(row[columnMap.salesRatio]) : 0,
          profit: columnMap.profit !== undefined ? parseAmount(row[columnMap.profit]) : 0,
          profitRatio: columnMap.profitRatio !== undefined ? parsePercent(row[columnMap.profitRatio]) : 0,
          profitRate: columnMap.profitRate !== undefined ? parsePercent(row[columnMap.profitRate]) : 0
        }

        if (person.name && person.name !== '氏名' && person.name !== '-') {
          const teamKey = currentDepartmentName || belongTeam || 'その他'

          if (!departmentMap[teamKey]) {
            departmentMap[teamKey] = []
          }
          departmentMap[teamKey].push(person)
        }
      }
    }
  }

  const teamOrder = result.teamSummary.map(t => t.team)
  const sortedTeamNames = Object.keys(departmentMap).sort((a, b) => {
    const idxA = teamOrder.indexOf(a)
    const idxB = teamOrder.indexOf(b)
    if (idxA === -1 && idxB === -1) return a.localeCompare(b)
    if (idxA === -1) return 1
    if (idxB === -1) return -1
    return idxA - idxB
  })

  for (const teamName of sortedTeamNames) {
    const rankings = departmentMap[teamName]
    rankings.sort((a, b) => (b.sales || 0) - (a.sales || 0))
    rankings.forEach((person, idx) => {
      person.rank = idx + 1
    })
    result.departments.push({
      name: teamName,
      rankings: rankings
    })
  }

  console.log(`[salesApi] ${sheetName} Complete: ${result.teamSummary.length} teams, ${result.departments.length} depts`)

  return result
}

/**
 * ヘッダー行を探してランキングデータをパース（全体シート用）
 */
const parseRankingByHeader = (data) => {
  const allResults = []

  for (let i = 0; i < data.length; i++) {
    const row = data[i]
    if (!row) continue

    const hasName = row.some(cell => String(cell || '').includes('氏名'))
    const hasTeamOrSales = row.some(cell => {
      const s = String(cell || '')
      return s.includes('所属') || s.includes('チーム') || s.includes('売上')
    })

    if (hasName && hasTeamOrSales) {
      const colRank = 0
      const colName = 1
      const colTeam = 2
      const colSales = 3
      const colSalesRatio = 4
      const colProfit = 5
      const colProfitRatio = 6
      const colProfitRate = 7

      for (let j = i + 1; j < data.length; j++) {
        const dataRow = data[j]
        if (!dataRow) continue

        const isNextHeader = dataRow.some(cell => String(cell || '').includes('氏名'))
        if (isNextHeader && j > i + 1) {
          break
        }

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

  console.log(`[salesApi] parseRankingByHeader: ${allResults.length} records`)
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
