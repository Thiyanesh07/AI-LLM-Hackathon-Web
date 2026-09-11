function getSpreadsheet() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();

  if (!spreadsheet) {
    throw new Error("Hackathon spreadsheet could not be found.");
  }

  return spreadsheet;
}


function getSheet(sheetName) {
  const spreadsheet = getSpreadsheet();
  const sheet = spreadsheet.getSheetByName(sheetName);

  if (!sheet) {
    throw new Error(`Sheet not found: ${sheetName}`);
  }

  return sheet;
}


function getSheetRecords(sheetName) {
  const sheet = getSheet(sheetName);
  const values = sheet.getDataRange().getValues();

  if (values.length < 2) {
    return [];
  }

  const headers = values[0].map(function(header) {
    return String(header).trim();
  });

  return values.slice(1).map(function(row) {
    const record = {};

    headers.forEach(function(header, index) {
      record[header] = row[index];
    });

    return record;
  });
}


function getSheetHeaderMap(sheetName) {
  const sheet = getSheet(sheetName);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const headerMap = {};

  headers.forEach(function(header, index) {
    headerMap[String(header).trim()] = index + 1;
  });

  return headerMap;
}


function findSheetRowNumber(sheetName, headerName, value) {
  const sheet = getSheet(sheetName);
  const headerMap = getSheetHeaderMap(sheetName);
  const column = headerMap[headerName];

  if (!column || sheet.getLastRow() < 2) {
    return null;
  }

  const expected = String(value || "").trim();
  const values = sheet.getRange(2, column, sheet.getLastRow() - 1, 1).getValues();

  for (let i = 0; i < values.length; i++) {
    if (String(values[i][0]).trim() === expected) {
      return i + 2;
    }
  }

  return null;
}


function normalizeEmail(email) {
  if (!email) {
    return "";
  }

  return String(email).trim().toLowerCase();
}


function normalizeRegisterNumber(registerNumber) {
  if (!registerNumber) {
    return "";
  }

  return String(registerNumber).trim().toUpperCase();
}


function getConfigValue(key) {
  const sheet = getSheet(SHEET_NAMES.CONFIG);

  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    const currentKey = String(data[i][0]).trim();

    if (currentKey === key) {
      return data[i][1];
    }
  }

  return null;
}


function setConfigValue(key, value) {
  const sheet = getSheet(SHEET_NAMES.CONFIG);
  const lastRow = sheet.getLastRow();

  if (lastRow >= 2) {
    const keys = sheet.getRange(2, 1, lastRow - 1, 1).getValues();

    for (let i = 0; i < keys.length; i++) {
      if (String(keys[i][0]).trim() === String(key).trim()) {
        sheet.getRange(i + 2, 2).setValue(value);
        return;
      }
    }
  }

  sheet.appendRow([String(key).trim(), value]);
}


function parseConfiguredDateTime(dateValue, timeValue) {
  if (dateValue instanceof Date && isNaN(dateValue.getTime())) {
    return null;
  }

  if (timeValue instanceof Date && isNaN(timeValue.getTime())) {
    return null;
  }

  const dateText = dateValue instanceof Date
    ? Utilities.formatDate(dateValue, APP_TIME_ZONE, "yyyy-MM-dd")
    : String(dateValue || "").trim();
  const timeText = timeValue instanceof Date
    ? Utilities.formatDate(timeValue, APP_TIME_ZONE, "HH:mm:ss")
    : String(timeValue || "").trim();

  if (!dateText || !timeText) {
    return null;
  }

  const normalizedDate = normalizeConfiguredDate(dateText);
  const normalizedTime = normalizeConfiguredTime(timeText);

  if (!normalizedDate || !normalizedTime) {
    return null;
  }

  const formats = [
    "yyyy-MM-dd HH:mm:ss",
    "yyyy-MM-dd HH:mm",
    "dd/MM/yyyy HH:mm:ss",
    "dd/MM/yyyy HH:mm",
    "MM/dd/yyyy HH:mm:ss",
    "MM/dd/yyyy HH:mm"
  ];

  for (let i = 0; i < formats.length; i++) {
    try {
      const parsed = Utilities.parseDate(
        normalizedDate + " " + normalizedTime,
        APP_TIME_ZONE,
        formats[i]
      );

      if (parsed && !isNaN(parsed.getTime())) {
        return parsed;
      }
    } catch (error) {
      // Try the next supported representation.
    }
  }

  return null;
}


function normalizeConfiguredDate(value) {
  const text = String(value || "").trim();

  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(text)) {
    const parts = text.split("-");
    return parts[0] + "-" + padNumber(parts[1]) + "-" + padNumber(parts[2]);
  }

  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(text)) {
    return text;
  }

  if (/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(text)) {
    const parts = text.split("/");
    return parts[0] + "-" + padNumber(parts[1]) + "-" + padNumber(parts[2]);
  }

  return "";
}


function normalizeConfiguredTime(value) {
  const text = String(value || "").trim();

  const twelveHourMatch = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)$/i);

  if (twelveHourMatch) {
    let hour = Number(twelveHourMatch[1]);
    const minute = twelveHourMatch[2];
    const second = twelveHourMatch[3] || "00";
    const meridiem = twelveHourMatch[4].toUpperCase();

    if (hour < 1 || hour > 12) {
      return "";
    }

    if (meridiem === "AM" && hour === 12) {
      hour = 0;
    }

    if (meridiem === "PM" && hour !== 12) {
      hour += 12;
    }

    return padNumber(hour) + ":" + minute + ":" + second;
  }

  if (/^\d{1,2}:\d{2}$/.test(text)) {
    return text + ":00";
  }

  if (/^\d{1,2}:\d{2}:\d{2}$/.test(text)) {
    return text;
  }

  return "";
}


function padNumber(value) {
  return String(value).length === 1 ? "0" + value : String(value);
}


function isProblemReleased() {
  const override = String(getConfigValue("ProblemReleaseOverride") || "")
    .trim()
    .toUpperCase();

  if (override === "TRUE") {
    return true;
  }

  const releaseDate = getConfigValue("ProblemReleaseDate");
  const releaseTime = getConfigValue("ProblemReleaseTime");
  const releaseAt = parseConfiguredDateTime(releaseDate, releaseTime);

  return releaseAt !== null && new Date().getTime() >= releaseAt.getTime();
}


function isSelectionOpen() {
  return String(getConfigValue("SelectionStatus") || "")
    .trim()
    .toUpperCase() === SELECTION_STATUS.OPEN;
}


function isRegistrationOpen() {
  const enabledValue = getConfigValue("REGISTRATION_ENABLED");
  if (enabledValue !== null && enabledValue !== undefined && String(enabledValue).trim() !== "") {
    const enabledStr = String(enabledValue).trim().toUpperCase();
    if (enabledStr === "FALSE") {
      return false;
    }
  }

  const deadlineValue = getConfigValue("REGISTRATION_DEADLINE");
  if (deadlineValue !== null && deadlineValue !== undefined && String(deadlineValue).trim() !== "") {
    let deadlineDate = null;
    if (deadlineValue instanceof Date) {
      deadlineDate = deadlineValue;
    } else {
      const parsedStr = String(deadlineValue).trim();
      if (parsedStr) {
        deadlineDate = new Date(parsedStr);
      }
    }

    if (deadlineDate && !isNaN(deadlineDate.getTime())) {
      if (new Date().getTime() >= deadlineDate.getTime()) {
        return false;
      }
    }
  }

  return true;
}


function checkRegistrationOpen() {
  if (!isRegistrationOpen()) {
    throwApiError("Registration has closed.", "REGISTRATION_CLOSED");
  }
}