const { PROJECTS } = require('./config');

function formatEntries(entriesByDate) {
  const sortedDates = Object.keys(entriesByDate).sort();

  return sortedDates.map(date => {
    const entries = entriesByDate[date];

    const byProject = {};
    for (const entry of entries) {
      if (!byProject[entry.project]) byProject[entry.project] = [];
      byProject[entry.project].push(entry);
    }

    let block = `## ${date}\n`;
    for (const [projectCode, projectEntries] of Object.entries(byProject)) {
      const projectName = PROJECTS[projectCode] || projectCode;
      block += `### ${projectName}:\n`;
      for (const e of projectEntries) {
        block += `- ${e.content} ${e.hours} 小時\n`;
      }
      block += '\n';
    }
    return block;
  }).join('\n');
}

module.exports = { formatEntries };
