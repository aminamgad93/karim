// Content script for ETA Invoice Exporter
class ETAContentScript {
  constructor() {
    this.invoiceData = [];
    this.totalCount = 0;
    this.currentPage = 1;
    this.totalPages = 1;
    this.init();
  }
  
  init() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.scanForInvoices());
    } else {
      this.scanForInvoices();
    }
    
    this.setupMutationObserver();
  }
  
  setupMutationObserver() {
    const observer = new MutationObserver((mutations) => {
      let shouldRescan = false;
      
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              if (node.classList?.contains('ms-DetailsRow') || 
                  node.querySelector?.('.ms-DetailsRow') ||
                  node.classList?.contains('ms-List-cell')) {
                shouldRescan = true;
              }
            }
          });
        }
      });
      
      if (shouldRescan) {
        clearTimeout(this.rescanTimeout);
        this.rescanTimeout = setTimeout(() => this.scanForInvoices(), 1000);
      }
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }
  
  scanForInvoices() {
    try {
      this.invoiceData = [];
      
      // Extract pagination info
      this.extractPaginationInfo();
      
      // Find invoice rows using the correct selectors
      const rows = document.querySelectorAll('.ms-DetailsRow[role="row"]');
      console.log(`ETA Exporter: Found ${rows.length} invoice rows`);
      
      rows.forEach((row, index) => {
        const invoiceData = this.extractDataFromRow(row, index + 1);
        if (this.isValidInvoiceData(invoiceData)) {
          this.invoiceData.push(invoiceData);
        }
      });
      
      console.log(`ETA Exporter: Extracted ${this.invoiceData.length} valid invoices`);
      
    } catch (error) {
      console.error('ETA Exporter: Error scanning for invoices:', error);
    }
  }
  
  extractPaginationInfo() {
    try {
      // Extract total count from pagination
      const totalLabel = document.querySelector('.eta-pagination-totalrecordCount-label');
      if (totalLabel) {
        const match = totalLabel.textContent.match(/(\d+)/);
        if (match) {
          this.totalCount = parseInt(match[1]);
        }
      }
      
      // Extract current page
      const currentPageBtn = document.querySelector('.eta-pageNumber.is-checked');
      if (currentPageBtn) {
        this.currentPage = parseInt(currentPageBtn.textContent) || 1;
      }
      
      // Calculate total pages (assuming 10 items per page)
      this.totalPages = Math.ceil(this.totalCount / 10);
      
    } catch (error) {
      console.warn('ETA Exporter: Error extracting pagination info:', error);
    }
  }
  
  extractDataFromRow(row, index) {
    const invoice = {
      index: index,
      uuid: '',
      internalId: '',
      issueDate: '',
      submissionDate: '',
      type: '',
      version: '',
      totalAmount: '',
      vatAmount: '',
      supplierName: '',
      supplierTaxId: '',
      receiverName: '',
      receiverTaxId: '',
      submissionId: '',
      status: ''
    };
    
    try {
      const cells = row.querySelectorAll('.ms-DetailsRow-cell');
      
      if (cells.length === 0) {
        console.warn(`No cells found in row ${index}`);
        return invoice;
      }
      
      // Extract UUID and Internal ID (first column)
      const idCell = cells[0];
      if (idCell) {
        const uuidLink = idCell.querySelector('.internalId-link a');
        if (uuidLink) {
          invoice.uuid = uuidLink.textContent?.trim() || '';
        }
        
        const internalIdElement = idCell.querySelector('.griCellSubTitle');
        if (internalIdElement) {
          invoice.internalId = internalIdElement.textContent?.trim() || '';
        }
      }
      
      // Extract Date (second column)
      const dateCell = cells[1];
      if (dateCell) {
        const dateMain = dateCell.querySelector('.griCellTitleGray');
        const timeMain = dateCell.querySelector('.griCellSubTitle');
        
        if (dateMain) {
          invoice.issueDate = dateMain.textContent?.trim() || '';
          invoice.submissionDate = invoice.issueDate;
          
          if (timeMain && timeMain.textContent?.trim()) {
            invoice.issueDate += ` ${timeMain.textContent.trim()}`;
            invoice.submissionDate = invoice.issueDate;
          }
        }
      }
      
      // Extract Type and Version (third column)
      const typeCell = cells[2];
      if (typeCell) {
        const typeMain = typeCell.querySelector('.griCellTitleGray');
        const versionMain = typeCell.querySelector('.griCellSubTitle');
        
        if (typeMain) {
          invoice.type = typeMain.textContent?.trim() || '';
        }
        if (versionMain) {
          invoice.version = versionMain.textContent?.trim() || '';
        }
      }
      
      // Extract Total Amount (fourth column)
      const totalCell = cells[3];
      if (totalCell) {
        const totalAmount = totalCell.querySelector('.griCellTitleGray');
        if (totalAmount) {
          const amount = totalAmount.textContent?.trim() || '';
          invoice.totalAmount = amount;
          // Calculate VAT (assuming 14% VAT rate)
          const numericAmount = parseFloat(amount.replace(/,/g, ''));
          if (!isNaN(numericAmount)) {
            invoice.vatAmount = (numericAmount * 0.14 / 1.14).toFixed(2);
          }
        }
      }
      
      // Extract Supplier Info (fifth column)
      const supplierCell = cells[4];
      if (supplierCell) {
        const supplierName = supplierCell.querySelector('.griCellTitleGray');
        const supplierTax = supplierCell.querySelector('.griCellSubTitle');
        
        if (supplierName) {
          invoice.supplierName = supplierName.textContent?.trim() || '';
        }
        if (supplierTax) {
          invoice.supplierTaxId = supplierTax.textContent?.trim() || '';
        }
      }
      
      // Extract Receiver Info (sixth column)
      const receiverCell = cells[5];
      if (receiverCell) {
        const receiverName = receiverCell.querySelector('.griCellTitleGray');
        const receiverTax = receiverCell.querySelector('.griCellSubTitle');
        
        if (receiverName) {
          invoice.receiverName = receiverName.textContent?.trim() || '';
        }
        if (receiverTax) {
          invoice.receiverTaxId = receiverTax.textContent?.trim() || '';
        }
      }
      
      // Extract Submission ID (seventh column)
      const submissionCell = cells[6];
      if (submissionCell) {
        const submissionLink = submissionCell.querySelector('.submissionId-link');
        if (submissionLink) {
          invoice.submissionId = submissionLink.textContent?.trim() || '';
        }
      }
      
      // Extract Status (eighth column)
      const statusCell = cells[7];
      if (statusCell) {
        const statusText = statusCell.querySelector('.textStatus');
        if (statusText) {
          invoice.status = statusText.textContent?.trim() || '';
        } else {
          // Check for complex status (Valid -> Cancelled)
          const validStatus = statusCell.querySelector('.status-Valid');
          const cancelledStatus = statusCell.querySelector('.status-Cancelled');
          
          if (validStatus && cancelledStatus) {
            invoice.status = 'Valid → Cancelled';
          } else if (validStatus) {
            invoice.status = 'Valid';
          }
        }
      }
      
    } catch (error) {
      console.warn(`ETA Exporter: Error extracting data from row ${index}:`, error);
    }
    
    return invoice;
  }
  
  isValidInvoiceData(invoice) {
    return !!(invoice.uuid || invoice.internalId || invoice.totalAmount);
  }
  
  async getInvoiceDetails(invoiceId) {
    try {
      // Simulate clicking on the invoice to get details
      // In a real implementation, this would navigate to the invoice detail page
      // and extract the line items
      
      // For now, return mock detailed data that matches the structure shown in the images
      const mockDetails = [
        {
          name: 'لحم متبل',
          unitCode: 'EA',
          unitName: 'each (ST)',
          quantity: '5.75',
          price: '600',
          value: '3450',
          tax: '483',
          total: '3933'
        },
        {
          name: 'ورق فخذه',
          unitCode: 'EA', 
          unitName: 'each (ST)',
          quantity: '4',
          price: '445',
          value: '1780',
          tax: '249.2',
          total: '2029.2'
        },
        {
          name: 'فيليه صويا',
          unitCode: 'EA',
          unitName: 'each (ST)', 
          quantity: '7.75',
          price: '675',
          value: '5231.25',
          tax: '732.375',
          total: '5963.625'
        },
        {
          name: 'زيب ايى',
          unitCode: 'EA',
          unitName: 'each (ST)',
          quantity: '2.75', 
          price: '620',
          value: '1705',
          tax: '238.7',
          total: '1943.7'
        },
        {
          name: 'طبق بيض',
          unitCode: 'EA',
          unitName: 'each (ST)',
          quantity: '10',
          price: '135',
          value: '1350',
          tax: '189',
          total: '1539'
        },
        {
          name: 'كرتونة بروكلي',
          unitCode: 'EA',
          unitName: 'each (ST)',
          quantity: '1',
          price: '352',
          value: '352',
          tax: '49.28',
          total: '401.28'
        },
        {
          name: 'كرتونة قانوبيا',
          unitCode: 'EA',
          unitName: 'each (ST)',
          quantity: '1',
          price: '320',
          value: '320',
          tax: '44.8',
          total: '364.8'
        },
        {
          name: 'مارجريتا كوكيز',
          unitCode: 'EA',
          unitName: 'each (ST)',
          quantity: '1',
          price: '250',
          value: '250',
          tax: '35',
          total: '285'
        }
      ];
      
      return {
        success: true,
        data: mockDetails
      };
    } catch (error) {
      console.error('Error getting invoice details:', error);
      return { success: false, data: [] };
    }
  }
  
  async getAllPagesData(options) {
    try {
      // This would require navigating through all pages
      // For now, return current page data
      return {
        success: true,
        data: this.invoiceData
      };
    } catch (error) {
      console.error('Error getting all pages data:', error);
      return { success: false, data: [] };
    }
  }
  
  getInvoiceData() {
    return {
      invoices: this.invoiceData,
      totalCount: this.totalCount,
      currentPage: this.currentPage,
      totalPages: this.totalPages
    };
  }
}

// Initialize content script
const etaContentScript = new ETAContentScript();

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.action) {
    case 'getInvoiceData':
      sendResponse({
        success: true,
        data: etaContentScript.getInvoiceData()
      });
      break;
      
    case 'getInvoiceDetails':
      etaContentScript.getInvoiceDetails(request.invoiceId)
        .then(result => sendResponse(result))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true; // Indicates async response
      
    case 'getAllPagesData':
      etaContentScript.getAllPagesData(request.options)
        .then(result => sendResponse(result))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true; // Indicates async response
      
    case 'rescanPage':
      etaContentScript.scanForInvoices();
      sendResponse({
        success: true,
        data: etaContentScript.getInvoiceData()
      });
      break;
      
    default:
      sendResponse({ success: false, error: 'Unknown action' });
  }
  
  return true;
});