#!/usr/bin/env node

const { execFileSync } = require('child_process');
const fs = require('fs');

const PAT = process.argv[2];
const ORG = process.argv[3];
const PROJECT = process.argv[4];
let DEPARTMENT = process.argv[5] || '';

// Unescape Windows command line escapes (^& becomes &)
DEPARTMENT = DEPARTMENT.replace(/\^&/g, '&');

if (!PAT || !ORG || !PROJECT) {
  console.error('Usage: node ado_report_simple.js <PAT> <ORG> <PROJECT> [DEPARTMENT]');
  console.error('Example: node ado_report_simple.js mytoken123 TR-DataAndAnalytics "Data-Strategy-and-Insights" "Customer Service & Support"');
  process.exit(1);
}

function makeCurlRequest(url, method = 'GET', data = null) {
  try {
    const args = ['-s', '-u', `:${PAT}`];
    
    if (method === 'POST') {
      args.push('-X', 'POST');
      args.push('-H', 'Content-Type: application/json');
      args.push('-d', data);
    }
    
    args.push(url);
    
    const response = execFileSync('curl', args, { 
      encoding: 'utf8'
    });
    return JSON.parse(response);
  } catch (error) {
    throw new Error(`API request failed: ${error.message}`);
  }
}

function generateHTMLReport(data, analysis, statuses, byAssignee) {
  const today = new Date();
  const dateStr = today.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  
  const avgAge = Math.round(analysis.reduce((sum, i) => sum + i.daysOld, 0) / analysis.length);
  const oldestItem = analysis.reduce((max, i) => i.daysOld > max.daysOld ? i : max);
  const active = analysis.filter(i => i.state === 'Active').length;
  const onHold = analysis.filter(i => i.state === 'On Hold').length;
  const critical = analysis.filter(i => i.daysOld > 300).length;
  const veryHigh = analysis.filter(i => i.daysOld >= 200 && i.daysOld <= 300).length;
  const high = analysis.filter(i => i.daysOld >= 150 && i.daysOld < 200).length;
  const medium = analysis.filter(i => i.daysOld >= 100 && i.daysOld < 150).length;
  const normal = analysis.filter(i => i.daysOld >= 30 && i.daysOld < 100).length;
  const recent = analysis.filter(i => i.daysOld < 30).length;
  
  // Categorize items
  const criticalItems = analysis.filter(i => i.daysOld > 300);
  const veryHighItems = analysis.filter(i => i.daysOld >= 200 && i.daysOld <= 300);
  const highItems = analysis.filter(i => i.daysOld >= 150 && i.daysOld < 200);
  const mediumItems = analysis.filter(i => i.daysOld >= 100 && i.daysOld < 150);
  const normalItems = analysis.filter(i => i.daysOld >= 30 && i.daysOld < 100);
  const recentItems = analysis.filter(i => i.daysOld < 30);
  
  // Build status table rows
  let statusRows = '';
  Object.entries(statuses).sort((a, b) => b[1] - a[1]).forEach(([status, count]) => {
    const percentage = Math.round((count / analysis.length) * 100);
    statusRows += `<tr><td>${status}</td><td>${count}</td><td>${percentage}%</td></tr>`;
  });
  
  // Build workload table rows
  let workloadRows = '';
  Object.entries(byAssignee)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 10)
    .forEach(([assignee, items]) => {
      workloadRows += `<tr><td>${assignee}</td><td>${items.length}</td></tr>`;
    });
  
  // Helper function to build category section with items
  function buildCategorySection(emoji, categoryName, ageRange, items) {
    if (items.length === 0) return '';
    
    let itemsHtml = '';
    items.forEach(item => {
      const ado_url = `https://dev.azure.com/${data.org || ''}/${data.project || ''}/_workitems/edit/${item.id}`;
      const statusText = item.state ? ` - ${item.state.toUpperCase()}` : '';
      itemsHtml += `<div style="margin-left: 20px; margin-bottom: 8px;">
        <div style="font-size: 11px; color: #000;">
          <a href="${ado_url}" style="color: #0066cc; text-decoration: none; font-weight: bold;">${item.id}</a> - ${item.title} - ${item.daysOld} days (${item.assignedTo})${statusText}
        </div>
      </div>`;
    });
    
    return `<div style="margin-bottom: 20px;">
      <div style="font-weight: bold; color: #123015; margin-bottom: 10px; font-size: 12px;">
        ${emoji} ${categoryName} (${ageRange}) - ${items.length} items:
      </div>
      ${itemsHtml}
    </div>`;
  }
  
  const criticalAlert = critical > 0 ? `
    <div style="background-color: #fff3e0; border-left: 4px solid #D64000; padding: 12px; margin: 15px 0; font-size: 12px;">
      <strong>⚠️ Action required:</strong> ${critical} critical items exceed 300 days outstanding. Escalation recommended.
    </div>
  ` : '';
  
  const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Azure DevOps Intake Report</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #000000;
            background-color: #f5f5f5;
            margin: 0;
            padding: 20px;
        }
        .container {
            max-width: 700px;
            margin: 0 auto;
            background-color: #ffffff;
            border-top: 4px solid #D64000;
        }
        .header {
            background-color: #123015;
            color: #ffffff;
            padding: 30px 20px;
            text-align: center;
        }
        .header h1 {
            margin: 0 0 10px 0;
            font-size: 24px;
            font-weight: bold;
        }
        .header p {
            margin: 5px 0;
            font-size: 14px;
            opacity: 0.95;
        }
        .content {
            padding: 30px 20px;
        }
        .section {
            margin-bottom: 30px;
        }
        .section h2 {
            color: #123015;
            font-size: 16px;
            font-weight: bold;
            border-bottom: 2px solid #D64000;
            padding-bottom: 10px;
            margin-bottom: 15px;
        }
        .metrics {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 15px;
            margin-bottom: 20px;
        }
        .metric {
            background-color: #f9f9f9;
            padding: 15px;
            border-left: 4px solid #D64000;
        }
        .metric-value {
            font-size: 24px;
            font-weight: bold;
            color: #D64000;
            margin-bottom: 5px;
        }
        .metric-label {
            font-size: 12px;
            color: #666666;
            text-transform: uppercase;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 15px;
        }
        th {
            background-color: #D64000;
            color: #ffffff;
            padding: 12px;
            text-align: left;
            font-weight: bold;
            font-size: 12px;
        }
        td {
            padding: 10px 12px;
            border-bottom: 1px solid #eeeeee;
            font-size: 12px;
        }
        tr:nth-child(even) {
            background-color: #f9f9f9;
        }
        .footer {
            background-color: #f5f5f5;
            padding: 20px;
            text-align: center;
            font-size: 11px;
            color: #999999;
            border-top: 1px solid #dddddd;
        }
        .cta-box {
            background-color: #e8f4f0;
            border-left: 4px solid #D64000;
            padding: 15px;
            margin: 15px 0;
        }
        .cta-box p {
            margin: 0;
            color: #123015;
            font-size: 13px;
        }
        .alert {
            background-color: #fff3e0;
            border-left: 4px solid #D64000;
            padding: 12px;
            margin: 15px 0;
            font-size: 12px;
        }
        .highlight {
            color: #D64000;
            font-weight: bold;
        }
        a {
            color: #0066cc;
            text-decoration: none;
        }
        a:hover {
            text-decoration: underline;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Azure DevOps Intake Report</h1>
            <p>Customer Service &amp; Support Department</p>
            <p>Generated: ${dateStr}</p>
        </div>

        <div class="content">
            <div class="section">
                <h2>Executive summary</h2>
                <div class="metrics">
                    <div class="metric">
                        <div class="metric-value">${analysis.length}</div>
                        <div class="metric-label">Total items</div>
                    </div>
                    <div class="metric">
                        <div class="metric-value">${avgAge}</div>
                        <div class="metric-label">Average age (days)</div>
                    </div>
                    <div class="metric">
                        <div class="metric-value">${active}</div>
                        <div class="metric-label">Active items</div>
                    </div>
                    <div class="metric">
                        <div class="metric-value">${onHold}</div>
                        <div class="metric-label">On hold</div>
                    </div>
                </div>
                <p>The intake pipeline currently contains <span class="highlight">${analysis.length}</span> active items. Average age is <span class="highlight">${avgAge}</span> days, with the oldest item <span class="highlight">${oldestItem.daysOld}</span> days outstanding.</p>
            </div>

            ${criticalAlert}

            <div class="section">
                <h2>Items by age category</h2>
                ${buildCategorySection('🔴', 'CRITICAL', '>300 days', criticalItems)}
                ${buildCategorySection('🔴', 'VERY HIGH', '200–299 days', veryHighItems)}
                ${buildCategorySection('🟡', 'HIGH', '150–199 days', highItems)}
                ${buildCategorySection('🟠', 'MEDIUM', '100–149 days', mediumItems)}
                ${buildCategorySection('🟢', 'NORMAL', '30–79 days', normalItems)}
                ${buildCategorySection('🟢', 'RECENT', '<30 days', recentItems)}
            </div>

            <div class="section">
                <h2>Status breakdown</h2>
                <table>
                    <thead>
                        <tr>
                            <th>Status</th>
                            <th>Count</th>
                            <th>Percentage</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${statusRows}
                    </tbody>
                </table>
            </div>

            <div class="section">
                <h2>Team workload</h2>
                <table>
                    <thead>
                        <tr>
                            <th>Team member</th>
                            <th>Items assigned</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${workloadRows}
                    </tbody>
                </table>
            </div>

            <div class="cta-box">
                <p><strong>Next steps:</strong> Review critical and very high priority items. Coordinate with team leads on escalations. Update item status in Azure DevOps as work progresses.</p>
            </div>
        </div>

        <div class="footer">
            <p>This report was generated from Azure DevOps work items (Intake type) for the Customer Service &amp; Support department. For access or questions, contact your project administrator.</p>
        </div>
    </div>
</body>
</html>`;
  
  return html;
}
async function generateReport() {
  try {
    console.log(`\n📊 Fetching work items from ${ORG}/${PROJECT}...\n`);

    // Build WIQL query with department filter if specified
    let wiqlQuery = `Select [System.Id], [System.Title], [System.State], [System.CreatedDate], [System.AssignedTo] From WorkItems Where [System.TeamProject] = '${PROJECT}' And [System.WorkItemType] = 'Intake' And [System.State] <> 'Closed' And [System.State] <> 'Removed'`;
    
    if (DEPARTMENT) {
      wiqlQuery += ` And [Department Supported] = '${DEPARTMENT}'`;
    }

    const wiqlUrl = `https://dev.azure.com/${ORG}/_apis/wit/wiql?api-version=7.1`;
    console.log(`📍 Using WIQL endpoint`);
    if (DEPARTMENT) {
      console.log(`📍 Filtering for: "${DEPARTMENT}"\n`);
    } else {
      console.log('\n');
    }
    
    const wiqlResponse = makeCurlRequest(wiqlUrl, 'POST', JSON.stringify({ query: wiqlQuery }));
    
    if (wiqlResponse.message) {
      throw new Error(wiqlResponse.message);
    }

    const workItemRefs = wiqlResponse.workItems || [];
    console.log(`✓ Found ${workItemRefs.length} total items`);
    console.log(`⏳ Fetching details for first 100 items...\n`);

    // Fetch all items (filtered by department after fetching)
    const detailedItems = [];
    const itemsToFetch = workItemRefs.length;
    console.log(`Fetching ${itemsToFetch} items (this may take a few minutes)...\n`);
    
    for (let i = 0; i < itemsToFetch; i++) {
      if (i % 100 === 0 && i > 0) {
        console.log(`Progress: ${i}/${itemsToFetch}`);
      }
      try {
        const itemId = workItemRefs[i].id;
        const detailUrl = `https://dev.azure.com/${ORG}/_apis/wit/workitems/${itemId}?api-version=7.1`;
        const detail = makeCurlRequest(detailUrl);
        detailedItems.push(detail);
        process.stdout.write('.');
      } catch (e) {
        // Skip errors
      }
    }
    console.log(`\n✓ Retrieved ${detailedItems.length} items\n`);

    // Analyze
    const today = new Date();
    const analysis = detailedItems.map(item => {
      const fields = item.fields || {};
      const created = new Date(fields['System.CreatedDate']);
      const daysOld = Math.floor((today - created) / (1000 * 60 * 60 * 24));
      
      return {
        id: item.id,
        title: fields['System.Title'],
        state: fields['System.State'],
        daysOld,
        assignedTo: fields['System.AssignedTo']?.displayName || 'Unassigned',
      };
    });

    // Categorize
    const critical = analysis.filter(i => i.daysOld > 300);
    const veryHigh = analysis.filter(i => i.daysOld >= 200 && i.daysOld <= 300);
    const high = analysis.filter(i => i.daysOld >= 150 && i.daysOld < 200);
    const medium = analysis.filter(i => i.daysOld >= 100 && i.daysOld < 150);
    const normal = analysis.filter(i => i.daysOld >= 30 && i.daysOld < 100);
    const recent = analysis.filter(i => i.daysOld < 30);

    // Group by status
    const statuses = {};
    analysis.forEach(item => {
      statuses[item.state] = (statuses[item.state] || 0) + 1;
    });

    // Group by assignee
    const byAssignee = {};
    analysis.forEach(item => {
      if (!byAssignee[item.assignedTo]) {
        byAssignee[item.assignedTo] = [];
      }
      byAssignee[item.assignedTo].push(item);
    });

    if (analysis.length === 0) {
      console.log(`\n❌ No items found matching department: ${DEPARTMENT}\n`);
      process.exit(0);
    }

    const avgAge = Math.round(analysis.reduce((sum, i) => sum + i.daysOld, 0) / analysis.length);
    const oldestItem = analysis.reduce((max, i) => i.daysOld > max.daysOld ? i : max);
    const onHold = analysis.filter(i => i.state === 'On Hold').length;
    const active = analysis.filter(i => i.state === 'Active').length;

    console.log('═'.repeat(70));
    console.log(`AZURE DEVOPS INTAKE REPORT - ${new Date().toISOString().split('T')[0]}`);
    console.log(`Project: ${PROJECT} | Organization: ${ORG}`);
    if (DEPARTMENT) {
      console.log(`Department: ${DEPARTMENT}`);
      console.log(`Total in project: ${workItemRefs.length} | Matching department: ${analysis.length}`);
    } else {
      console.log(`Total items: ${analysis.length}`);
    }
    console.log('═'.repeat(70));

    console.log('\n📊 EXECUTIVE SUMMARY\n');
    console.log(`Analyzed Items: ${analysis.length}`);
    console.log(`Average Age: ${avgAge} days`);
    console.log(`Oldest Item: ${oldestItem.daysOld} days (${oldestItem.title.substring(0, 50)})`);
    console.log(`Active Items: ${active} (${Math.round(active / analysis.length * 100)}%)`);
    console.log(`On Hold Items: ${onHold} (${Math.round(onHold / analysis.length * 100)}%)`);

    console.log('\n📈 ITEMS BY AGE CATEGORY\n');
    console.log(`🔴 CRITICAL (>300 days): ${critical.length} items`);
    console.log(`🔴 VERY HIGH (200-300 days): ${veryHigh.length} items`);
    console.log(`🟡 HIGH (150-199 days): ${high.length} items`);
    console.log(`🟠 MEDIUM (100-149 days): ${medium.length} items`);
    console.log(`🟢 NORMAL (30-79 days): ${normal.length} items`);
    console.log(`🟢 RECENT (<30 days): ${recent.length} items`);

    console.log('\n⚙️  STATUS BREAKDOWN\n');
    Object.entries(statuses).sort((a, b) => b[1] - a[1]).forEach(([status, count]) => {
      console.log(`${status}: ${count} items (${Math.round(count / analysis.length * 100)}%)`);
    });

    console.log('\n👥 TEAM WORKLOAD\n');
    Object.entries(byAssignee)
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 10)
      .forEach(([assignee, items]) => {
        console.log(`${assignee}: ${items.length} items`);
      });

    console.log('\n' + '═'.repeat(70));
    console.log('\n✓ Report complete!\n');

    // Save to JSON
    const reportData = {
      generated: new Date().toISOString(),
      org: ORG,
      project: PROJECT,
      summary: {
        totalInProject: workItemRefs.length,
        analyzed: analysis.length,
        averageAge: avgAge,
        oldestItem: oldestItem,
        active,
        onHold
      },
      byAge: { 
        critical: critical, 
        veryHigh: veryHigh, 
        high: high, 
        medium: medium, 
        normal: normal, 
        recent: recent 
      },
      byStatus: statuses,
      byAssignee: Object.fromEntries(Object.entries(byAssignee).map(([k, v]) => [k, v.length])),
      items: analysis.slice(0, 20) // Save first 20 items
    };

    const filename = `ado_report_${new Date().toISOString().split('T')[0]}.json`;
    fs.writeFileSync(filename, JSON.stringify(reportData, null, 2));
    console.log(`📁 Data saved to: ${filename}`);

    // Generate and save HTML report
    const htmlContent = generateHTMLReport(reportData, analysis, statuses, byAssignee);
    const htmlFilename = `ado_report_${new Date().toISOString().split('T')[0]}.html`;
    fs.writeFileSync(htmlFilename, htmlContent);
    console.log(`📧 Email report saved to: ${htmlFilename}`);
    
    // Generate Word document
    const wordDocname = `ado_report_${new Date().toISOString().split('T')[0]}.docx`;
    try {
      execFileSync('python3', ['generate_ado_report_word.py', filename, wordDocname]);
      console.log(`📄 Word document saved: ${wordDocname}\n`);
    } catch (e) {
      console.log(`\n⚠️  Could not generate Word document (python3 may not be available)`);
    }

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

generateReport();
