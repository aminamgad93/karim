class ETAInvoiceExporter {
  constructor() {
    this.invoiceData = [];
    this.totalCount = 0;
    this.currentPage = 1;
    this.totalPages = 1;
    
    this.initializeElements();
    this.attachEventListeners();
    this.checkCurrentPage();
  }
  
  initializeElements() {
    this.elements = {
      countInfo: document.getElementById('countInfo'),
      totalCountText: document.getElementById('totalCountText'),
      status: document.getElementById('status'),
      closeBtn: document.getElementById('closeBtn'),
      jsonBtn: document.getElementById('jsonBtn'),
      excelBtn: document.getElementById('excelBtn'),
      pdfBtn: document.getElementById('pdfBtn'),
      checkboxes: {
        date: document.getElementById('option-date'),
        id: document.getElementById('option-id'),
        sellerId: document.getElementById('option-seller-id'),
        sellerName: document.getElementById('option-seller-name'),
        buyerId: document.getElementById('option-buyer-id'),
        buyerName: document.getElementById('option-buyer-name'),
        uuid: document.getElementById('option-uuid'),
        type: document.getElementById('option-type'),
        separateSeller: document.getElementById('option-separate-seller'),
        separateBuyer: document.getElementById('option-separate-buyer'),
        downloadDetails: document.getElementById('option-download-details'),
        combineAll: document.getElementById('option-combine-all'),
        downloadAll: document.getElementById('option-download-all')
      }
    };
  }
  
  attachEventListeners() {
    this.elements.closeBtn.addEventListener('click', () => window.close());
    this.elements.excelBtn.addEventListener('click', () => this.handleExport('excel'));
    this.elements.jsonBtn.addEventListener('click', () => this.handleExport('json'));
    this.elements.pdfBtn.addEventListener('click', () => this.handleExport('pdf'));
  }
  
  async checkCurrentPage() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab.url.includes('invoicing.eta.gov.eg')) {
        this.showStatus('يرجى الانتقال إلى بوابة الفواتير الإلكترونية المصرية', 'error');
        this.disableButtons();
        return;
      }
      
      await this.loadInvoiceData();
    } catch (error) {
      this.showStatus('خطأ في فحص الصفحة الحالية', 'error');
      console.error('Error:', error);
    }
  }
  
  async loadInvoiceData() {
    try {
      this.showStatus('جاري تحميل بيانات الفواتير...', 'loading');
      
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const response = await chrome.tabs.sendMessage(tab.id, { action: 'getInvoiceData' });
      
      if (!response || !response.success) {
        throw new Error('فشل في الحصول على بيانات الفواتير');
      }
      
      this.invoiceData = response.data.invoices || [];
      this.totalCount = response.data.totalCount || this.invoiceData.length;
      this.currentPage = response.data.currentPage || 1;
      this.totalPages = response.data.totalPages || 1;
      
      this.updateUI();
      this.showStatus('تم تحميل البيانات بنجاح', 'success');
      
    } catch (error) {
      this.showStatus('خطأ في تحميل البيانات: ' + error.message, 'error');
      console.error('Load error:', error);
    }
  }
  
  updateUI() {
    const currentPageCount = this.invoiceData.length;
    this.elements.countInfo.textContent = `الصفحة الحالية: ${currentPageCount} فاتورة | المجموع: ${this.totalCount} فاتورة`;
    this.elements.totalCountText.textContent = this.totalCount;
  }
  
  getSelectedOptions() {
    const options = {};
    Object.keys(this.elements.checkboxes).forEach(key => {
      options[key] = this.elements.checkboxes[key].checked;
    });
    return options;
  }
  
  async handleExport(format) {
    const options = this.getSelectedOptions();
    
    if (!this.validateOptions(options)) {
      return;
    }
    
    this.disableButtons();
    
    try {
      if (options.downloadAll) {
        await this.exportAllPages(format, options);
      } else {
        await this.exportCurrentPage(format, options);
      }
    } catch (error) {
      this.showStatus('خطأ في التصدير: ' + error.message, 'error');
      console.error('Export error:', error);
    } finally {
      this.enableButtons();
    }
  }
  
  validateOptions(options) {
    const hasBasicField = options.date || options.id || options.uuid;
    if (!hasBasicField) {
      this.showStatus('يرجى اختيار حقل واحد على الأقل للتصدير', 'error');
      return false;
    }
    return true;
  }
  
  async exportCurrentPage(format, options) {
    this.showStatus('جاري تصدير الصفحة الحالية...', 'loading');
    
    let dataToExport = [...this.invoiceData];
    
    if (options.downloadDetails) {
      this.showStatus('جاري تحميل تفاصيل الفواتير...', 'loading');
      dataToExport = await this.loadInvoiceDetails(dataToExport);
    }
    
    await this.generateFile(dataToExport, format, options);
    this.showStatus(`تم تصدير ${dataToExport.length} فاتورة بنجاح!`, 'success');
  }
  
  async exportAllPages(format, options) {
    this.showStatus('جاري تحميل جميع الصفحات...', 'loading');
    
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const allData = await chrome.tabs.sendMessage(tab.id, { 
      action: 'getAllPagesData',
      options: options
    });
    
    if (!allData || !allData.success) {
      throw new Error('فشل في تحميل جميع الصفحات');
    }
    
    let dataToExport = allData.data;
    
    if (options.downloadDetails) {
      this.showStatus('جاري تحميل تفاصيل جميع الفواتير...', 'loading');
      dataToExport = await this.loadInvoiceDetails(dataToExport);
    }
    
    await this.generateFile(dataToExport, format, options);
    this.showStatus(`تم تصدير ${dataToExport.length} فاتورة من جميع الصفحات!`, 'success');
  }
  
  async loadInvoiceDetails(invoices) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const detailedInvoices = [];
    
    for (let i = 0; i < invoices.length; i++) {
      const invoice = invoices[i];
      this.showStatus(`جاري تحميل تفاصيل الفاتورة ${i + 1} من ${invoices.length}...`, 'loading');
      
      try {
        const detailResponse = await chrome.tabs.sendMessage(tab.id, {
          action: 'getInvoiceDetails',
          invoiceId: invoice.uuid
        });
        
        if (detailResponse && detailResponse.success) {
          detailedInvoices.push({
            ...invoice,
            details: detailResponse.data
          });
        } else {
          detailedInvoices.push(invoice);
        }
      } catch (error) {
        console.warn(`Failed to load details for invoice ${invoice.uuid}:`, error);
        detailedInvoices.push(invoice);
      }
      
      // Add small delay to avoid overwhelming the server
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    return detailedInvoices;
  }
  
  async generateFile(data, format, options) {
    switch (format) {
      case 'excel':
        this.generateInteractiveExcelFile(data, options);
        break;
      case 'json':
        this.generateJSONFile(data, options);
        break;
      case 'pdf':
        this.showStatus('تصدير PDF غير متاح حاليًا', 'error');
        break;
    }
  }
  
  generateInteractiveExcelFile(data, options) {
    const wb = XLSX.utils.book_new();
    
    // Create main summary sheet with interactive view buttons
    this.createInteractiveSummarySheet(wb, data, options);
    
    // Create details sheets for each invoice
    if (options.downloadDetails) {
      this.createDetailsSheets(wb, data, options);
    }
    
    // Add VBA code for interactivity
    this.addVBACode(wb);
    
    const timestamp = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const filename = `ETA_Invoices_Interactive_${timestamp}.xlsx`;
    
    XLSX.writeFile(wb, filename);
  }
  
  createInteractiveSummarySheet(wb, data, options) {
    // Arabic headers matching the image
    const headers = [
      'مسلسل',        // Serial
      'تفاصيل',       // Details (View button)
      'نوع المستند',   // Document Type
      'نسخة المستند',  // Document Version
      'الحالة',       // Status
      'تاريخ الإصدار', // Issue Date
      'تاريخ التقديم',  // Submission Date
      'عملة الفاتورة', // Invoice Currency
      'قيمة الفاتورة', // Invoice Value
      'ضريبة القيمة المضافة', // VAT
      'الخصم تحت حساب الضريبة', // Tax Discount
      'إجمالي الفاتورة' // Total Invoice
    ];
    
    const rows = [headers];
    
    data.forEach((invoice, index) => {
      const row = [
        index + 1,                    // Serial number
        'عرض',                       // View button text
        invoice.type || 'فاتورة',     // Document type
        invoice.version || '1.0',     // Version
        invoice.status || 'Valid',    // Status
        invoice.issueDate || '',      // Issue date
        invoice.submissionDate || '', // Submission date
        'EGP',                       // Currency
        invoice.totalAmount || '',    // Invoice value
        invoice.vatAmount || '',      // VAT amount
        '',                          // Tax discount
        invoice.totalAmount || ''     // Total
      ];
      rows.push(row);
    });
    
    const ws = XLSX.utils.aoa_to_sheet(rows);
    
    // Format the worksheet
    this.formatInteractiveWorksheet(ws, headers, data.length);
    
    // Add hyperlinks to view buttons
    this.addViewButtonHyperlinks(ws, data.length);
    
    XLSX.utils.book_append_sheet(wb, ws, 'ملخص الفواتير');
  }
  
  formatInteractiveWorksheet(ws, headers, dataLength) {
    // Set column widths
    const colWidths = [
      { wch: 8 },   // Serial
      { wch: 10 },  // View button
      { wch: 15 },  // Document type
      { wch: 12 },  // Version
      { wch: 12 },  // Status
      { wch: 15 },  // Issue date
      { wch: 15 },  // Submission date
      { wch: 12 },  // Currency
      { wch: 15 },  // Invoice value
      { wch: 18 },  // VAT
      { wch: 20 },  // Tax discount
      { wch: 15 }   // Total
    ];
    
    ws['!cols'] = colWidths;
    
    // Style the header row
    const range = XLSX.utils.decode_range(ws['!ref']);
    for (let col = range.s.c; col <= range.e.c; col++) {
      const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col });
      if (!ws[cellAddress]) continue;
      
      ws[cellAddress].s = {
        font: { bold: true, color: { rgb: "FFFFFF" } },
        fill: { fgColor: { rgb: "366092" } },
        alignment: { horizontal: "center", vertical: "center" },
        border: {
          top: { style: "thin", color: { rgb: "000000" } },
          bottom: { style: "thin", color: { rgb: "000000" } },
          left: { style: "thin", color: { rgb: "000000" } },
          right: { style: "thin", color: { rgb: "000000" } }
        }
      };
    }
    
    // Style the view buttons (column B)
    for (let row = 1; row <= dataLength; row++) {
      const cellAddress = XLSX.utils.encode_cell({ r: row, c: 1 }); // Column B (index 1)
      if (!ws[cellAddress]) continue;
      
      ws[cellAddress].s = {
        font: { bold: true, color: { rgb: "FFFFFF" } },
        fill: { fgColor: { rgb: "4CAF50" } },
        alignment: { horizontal: "center", vertical: "center" },
        border: {
          top: { style: "thin", color: { rgb: "000000" } },
          bottom: { style: "thin", color: { rgb: "000000" } },
          left: { style: "thin", color: { rgb: "000000" } },
          right: { style: "thin", color: { rgb: "000000" } }
        }
      };
    }
  }
  
  addViewButtonHyperlinks(ws, dataLength) {
    // Add hyperlinks to view buttons that link to detail sheets
    for (let row = 1; row <= dataLength; row++) {
      const cellAddress = XLSX.utils.encode_cell({ r: row, c: 1 }); // Column B
      const sheetName = `تفاصيل_فاتورة_${row}`;
      
      if (ws[cellAddress]) {
        ws[cellAddress].l = {
          Target: `#'${sheetName}'!A1`,
          Tooltip: `عرض تفاصيل الفاتورة رقم ${row}`
        };
      }
    }
  }
  
  createDetailsSheets(wb, data, options) {
    data.forEach((invoice, index) => {
      if (invoice.details && invoice.details.length > 0) {
        const headers = [
          'إسم الصنف',           // Item name
          'كود الوحدة',          // Unit code
          'إسم الوحدة',          // Unit name
          'الكمية',             // Quantity
          'السعر',              // Price
          'القيمة',             // Value
          'ضريبة القيمة المضافة', // VAT
          'إجمالي'              // Total
        ];
        
        const rows = [headers];
        
        // Add invoice header info
        rows.push([
          `فاتورة رقم: ${invoice.internalId || index + 1}`,
          `التاريخ: ${invoice.issueDate || ''}`,
          `المورد: ${invoice.supplierName || ''}`,
          `العميل: ${invoice.receiverName || ''}`,
          `الإجمالي: ${invoice.totalAmount || ''} EGP`,
          '', '', ''
        ]);
        
        rows.push(['', '', '', '', '', '', '', '']); // Empty row
        
        // Add detail items
        invoice.details.forEach(item => {
          rows.push([
            item.name || '',
            item.unitCode || '',
            item.unitName || '',
            item.quantity || '',
            item.price || '',
            item.value || '',
            item.tax || '',
            item.total || ''
          ]);
        });
        
        // Add totals row
        const totalValue = invoice.details.reduce((sum, item) => sum + (parseFloat(item.value) || 0), 0);
        const totalTax = invoice.details.reduce((sum, item) => sum + (parseFloat(item.tax) || 0), 0);
        const grandTotal = totalValue + totalTax;
        
        rows.push(['', '', '', '', 'الإجمالي:', totalValue.toFixed(2), totalTax.toFixed(2), grandTotal.toFixed(2)]);
        
        const ws = XLSX.utils.aoa_to_sheet(rows);
        
        // Format the details sheet
        this.formatDetailsWorksheet(ws, headers);
        
        const sheetName = `تفاصيل_فاتورة_${index + 1}`;
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
      }
    });
  }
  
  formatDetailsWorksheet(ws, headers) {
    const colWidths = [
      { wch: 25 }, // Item name
      { wch: 12 }, // Unit code
      { wch: 20 }, // Unit name
      { wch: 10 }, // Quantity
      { wch: 12 }, // Price
      { wch: 12 }, // Value
      { wch: 15 }, // VAT
      { wch: 12 }  // Total
    ];
    
    ws['!cols'] = colWidths;
    
    // Style the header row
    const range = XLSX.utils.decode_range(ws['!ref']);
    for (let col = range.s.c; col <= range.e.c; col++) {
      const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col });
      if (!ws[cellAddress]) continue;
      
      ws[cellAddress].s = {
        font: { bold: true, color: { rgb: "FFFFFF" } },
        fill: { fgColor: { rgb: "2196F3" } },
        alignment: { horizontal: "center", vertical: "center" }
      };
    }
  }
  
  addVBACode(wb) {
    // Add VBA code for enhanced interactivity
    const vbaCode = `
Sub ViewInvoiceDetails(invoiceRow As Integer)
    Dim sheetName As String
    sheetName = "تفاصيل_فاتورة_" & invoiceRow
    
    On Error GoTo SheetNotFound
    Worksheets(sheetName).Activate
    Range("A1").Select
    Exit Sub
    
SheetNotFound:
    MsgBox "لم يتم العثور على تفاصيل هذه الفاتورة", vbInformation, "تنبيه"
End Sub

Private Sub Worksheet_SelectionChange(ByVal Target As Range)
    If Target.Column = 2 And Target.Row > 1 Then ' Column B (View buttons)
        If Target.Value = "عرض" Then
            Call ViewInvoiceDetails(Target.Row - 1)
        End If
    End If
End Sub
    `;
    
    // Note: XLSX.js doesn't support VBA directly, but we can add it as a comment
    // In a real implementation, you would need to use a different library or approach
  }
  
  generateJSONFile(data, options) {
    const jsonData = {
      exportDate: new Date().toISOString(),
      totalCount: data.length,
      options: options,
      invoices: data
    };
    
    const blob = new Blob([JSON.stringify(jsonData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `ETA_Invoices_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
  
  showStatus(message, type = '') {
    this.elements.status.textContent = message;
    this.elements.status.className = `status ${type}`;
    
    if (type === 'loading') {
      this.elements.status.innerHTML = `${message} <span class="loading-spinner"></span>`;
    }
    
    if (type === 'success' || type === 'error') {
      setTimeout(() => {
        this.elements.status.textContent = '';
        this.elements.status.className = 'status';
      }, 3000);
    }
  }
  
  disableButtons() {
    this.elements.excelBtn.disabled = true;
    this.elements.jsonBtn.disabled = true;
    this.elements.pdfBtn.disabled = true;
  }
  
  enableButtons() {
    this.elements.excelBtn.disabled = false;
    this.elements.jsonBtn.disabled = false;
    this.elements.pdfBtn.disabled = false;
  }
}

// Initialize the exporter when popup loads
document.addEventListener('DOMContentLoaded', () => {
  new ETAInvoiceExporter();
});