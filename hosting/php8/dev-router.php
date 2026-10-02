<?php
// Local PHP development server only; production uses public_html/.htaccess.
$requestPath = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?: '/';
$documentRoot = __DIR__ . '/public_html';
$file = realpath($documentRoot . $requestPath);
if ($file !== false && strpos($file, realpath($documentRoot) . DIRECTORY_SEPARATOR) === 0 && is_file($file) && strtolower(pathinfo($file, PATHINFO_EXTENSION)) !== 'php') return false;
$_SERVER['SCRIPT_NAME'] = '/index.php';
require $documentRoot . '/index.php';
