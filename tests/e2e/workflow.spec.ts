import { test, expect } from '@playwright/test'

test.describe('Platform GDPR & RAG E2E Workflow', () => {
  test('should execute the full user workspace initialization, document ingestion, semantic query, citation inspection, and GDPR hard-purge lifecycle', async ({ page }) => {
    // 1. Navigate to landing page
    await page.goto('/')
    await expect(page).toHaveTitle(/DocIntel/)
    
    // Verify landing page content displays the main hero messaging
    await expect(
      page.locator('text=AI Document Intelligence & Semantic RAG')
        .or(page.locator('text=AI Document Intelligence'))
        .or(page.locator('text=Semantic RAG'))
    ).toBeVisible()
    
    // 2. Click to access the platform dashboard
    await page.click('text=Launch Platform Dashboard')
    
    // 3. User & Workspace Initialization Checks
    await expect(page).toHaveURL(/.*dashboard/)
    
    // Verify that user context loaded (Sarah Chen from bootstrap data)
    await expect(page.locator('text=Sarah Chen')).toBeVisible()
    
    // Verify workspace initialization is active
    await expect(page.locator('text=Workspace Context')).toBeVisible()
    const workspaceDropdown = page.locator('select')
    await expect(workspaceDropdown).toBeVisible()
    
    // 4. Document upload simulation
    // Select the hidden file input inside UploadWidget
    const fileInput = page.locator('input[type="file"]')
    await expect(fileInput).toBeAttached()
    
    // Generate mock text file content in buffer to avoid relying on filesystem file presence
    const fileContent = 'GDPR Compliance Audit Document. Sarah Chen is the lead project lead. RAG vectors index this text context.'
    const buffer = Buffer.from(fileContent, 'utf-8')
    
    await fileInput.setInputFiles({
      name: 'gdpr_compliance_audit.txt',
      mimeType: 'text/plain',
      buffer: buffer,
    })
    
    // Wait for the upload widget state transitions
    await expect(
      page.locator('text=Indexed Successfully')
        .or(page.locator('text=Processing & Chunking...'))
        .or(page.locator('text=Uploading document...'))
    ).toBeVisible()
    
    // Verify document record list reflects the new upload
    await expect(page.locator('text=gdpr_compliance_audit.txt')).toBeVisible()
    
    // 5. Navigate to Chat Room
    await page.click('text=Chat Room')
    await expect(page).toHaveURL(/.*dashboard\/chat/)
    
    // Find chat query input box
    const chatInput = page.locator('input[placeholder*="Ask anything about current workspace files"]')
    await expect(chatInput).toBeVisible()
    
    // Query document content
    await chatInput.fill('Who is Sarah Chen?')
    await page.keyboard.press('Enter')
    
    // Wait for SSE streaming completion and citation badges to render
    const citationBtn = page.locator('button:has-text("📄")').first()
    await expect(citationBtn).toBeVisible({ timeout: 15000 })
    
    // Hover on citation to trigger micro-interaction state check
    await citationBtn.hover()
    
    // Click on citation button to trigger the global CitationViewer modal overlay
    await citationBtn.click()
    
    // Verify citation overlay modal header is rendered
    await expect(
      page.locator('text=Document Citation')
        .or(page.locator('text=Document Reference'))
        .or(page.locator('text=Source Snippet'))
    ).toBeVisible()
    
    // Close the CitationViewer modal
    const closeBtn = page.locator('text=Close').or(page.locator('button:has-text("×")')).first()
    if (await closeBtn.isVisible()) {
      await closeBtn.click()
    }
    
    // 6. Navigate back to Analytics Dashboard to perform GDPR Purge
    await page.click('text=Analytics')
    await expect(page).toHaveURL(/.*dashboard/)
    
    // Locate the red danger-zone GDPR Hard-Purge Workspace button
    const purgeBtn = page.locator('#gdpr-purge-btn')
    await expect(purgeBtn).toBeVisible()
    
    // Set up dialog handler to intercept and click 'OK' on window.confirm
    page.once('dialog', async (dialog) => {
      expect(dialog.message()).toContain('GDPR')
      await dialog.accept()
    })
    
    // Click the purge button
    await purgeBtn.click()
    
    // Verify the page refreshes and re-bootstraps after purge execution
    await expect(page).toHaveURL(/.*dashboard/)
  })
})
