// Raw ESC/POS printing through the Windows print spooler. The receipt is
// built entirely in the frontend (see src/lib/receipt.ts) - this side only
// hands the finished bytes to a printer, by its Windows name, with the RAW
// datatype so the driver passes them through untouched.

#[tauri::command]
pub async fn list_printers() -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(platform::list_printers)
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn print_raw(printer_name: String, data: Vec<u8>) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || platform::print_raw(&printer_name, &data))
        .await
        .map_err(|error| error.to_string())?
}

#[cfg(windows)]
mod platform {
    use windows::core::{HSTRING, PWSTR};
    use windows::Win32::Graphics::Printing::{
        ClosePrinter, EndDocPrinter, EndPagePrinter, EnumPrintersW, OpenPrinterW, StartDocPrinterW,
        StartPagePrinter, WritePrinter, DOC_INFO_1W, PRINTER_ENUM_CONNECTIONS, PRINTER_ENUM_LOCAL,
        PRINTER_HANDLE, PRINTER_INFO_4W,
    };

    pub fn list_printers() -> Result<Vec<String>, String> {
        let flags = PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS;
        let mut needed = 0u32;
        let mut returned = 0u32;

        // First call only reports the buffer size; it "fails" with
        // ERROR_INSUFFICIENT_BUFFER by design, so its result is ignored.
        unsafe {
            let _ = EnumPrintersW(flags, None, 4, None, &mut needed, &mut returned);
        }
        if needed == 0 {
            return Ok(Vec::new());
        }

        // u64-backed so the buffer is aligned for the PRINTER_INFO_4W structs
        // the spooler writes at its start.
        let mut buffer = vec![0u64; (needed as usize).div_ceil(8)];
        let bytes = unsafe { std::slice::from_raw_parts_mut(buffer.as_mut_ptr().cast::<u8>(), needed as usize) };
        unsafe { EnumPrintersW(flags, None, 4, Some(bytes), &mut needed, &mut returned) }
            .map_err(|error| format!("Could not list printers: {error}"))?;

        let infos = unsafe { std::slice::from_raw_parts(buffer.as_ptr().cast::<PRINTER_INFO_4W>(), returned as usize) };
        Ok(infos
            .iter()
            .filter_map(|info| unsafe { info.pPrinterName.to_string() }.ok())
            .collect())
    }

    pub fn print_raw(printer_name: &str, data: &[u8]) -> Result<(), String> {
        let mut handle = PRINTER_HANDLE::default();
        unsafe { OpenPrinterW(&HSTRING::from(printer_name), &mut handle, None) }
            .map_err(|error| format!("Could not open printer \"{printer_name}\": {error}"))?;

        let result = write_document(handle, data);
        unsafe {
            let _ = ClosePrinter(handle);
        }
        result
    }

    fn write_document(handle: PRINTER_HANDLE, data: &[u8]) -> Result<(), String> {
        let mut doc_name: Vec<u16> = "Receipt\0".encode_utf16().collect();
        let mut datatype: Vec<u16> = "RAW\0".encode_utf16().collect();
        let doc_info = DOC_INFO_1W {
            pDocName: PWSTR(doc_name.as_mut_ptr()),
            pOutputFile: PWSTR::null(),
            pDatatype: PWSTR(datatype.as_mut_ptr()),
        };

        if unsafe { StartDocPrinterW(handle, 1, &doc_info) } == 0 {
            return Err(format!("Could not start print job: {}", windows::core::Error::from_win32()));
        }

        let result = write_page(handle, data);
        unsafe {
            let _ = EndDocPrinter(handle);
        }
        result
    }

    fn write_page(handle: PRINTER_HANDLE, data: &[u8]) -> Result<(), String> {
        if !unsafe { StartPagePrinter(handle) }.as_bool() {
            return Err(format!("Could not start page: {}", windows::core::Error::from_win32()));
        }

        let mut written = 0u32;
        let ok = unsafe { WritePrinter(handle, data.as_ptr().cast(), data.len() as u32, &mut written) }.as_bool();
        let write_error = (!ok).then(windows::core::Error::from_win32);
        unsafe {
            let _ = EndPagePrinter(handle);
        }

        if let Some(error) = write_error {
            return Err(format!("Could not send data to printer: {error}"));
        }
        if written as usize != data.len() {
            return Err(format!("Printer accepted only {written} of {} bytes", data.len()));
        }
        Ok(())
    }
}

#[cfg(not(windows))]
mod platform {
    pub fn list_printers() -> Result<Vec<String>, String> {
        Ok(Vec::new())
    }

    pub fn print_raw(_printer_name: &str, _data: &[u8]) -> Result<(), String> {
        Err("Receipt printing is only supported on Windows".into())
    }
}
