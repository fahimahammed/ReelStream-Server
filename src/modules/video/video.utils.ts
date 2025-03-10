import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import fs from 'fs';
// import ffmpegPath from 'ffmpeg-static';
import { promisify } from 'util';
import { tmpdir } from 'os';
import { exec } from 'child_process';
import { Buffer } from 'node:buffer';
import ApiError from '../../errors/ApiError';
import { StatusCodes } from 'http-status-codes';

const unlinkAsync = promisify(fs.unlink);
const readFileAsync = promisify(fs.readFile);
const writeFileAsync = promisify(fs.writeFile);

export const compressVideo = async (
    videoBuffer: Buffer,
    progressUpdate: (chunkSize: number) => void
): Promise<Buffer> => {

    const tempInputPath = path.join(tmpdir(), `input_${Date.now()}.mp4`);
    const tempOutputPath = path.join(tmpdir(), `output_${Date.now()}.mp4`);

    try {
        await writeFileAsync(tempInputPath, videoBuffer);

        const { duration } = await getVideoDuration(tempInputPath);
        if (duration >= 60) {
            throw new ApiError(StatusCodes.BAD_REQUEST, 'Video duration must be less than 60 seconds.');
        }

        await new Promise<void>((resolve, reject) => {
            ffmpeg(tempInputPath)
                .outputOptions([
                    '-preset fast',
                    '-crf 28',
                    '-b:v 1M',
                    '-movflags +faststart'
                ])
                .output(tempOutputPath)
                .on('progress', (progress) => {
                    progressUpdate(progress.targetSize)
                })
                .on('end', () => resolve())
                .on('error', reject)
                .run();
        });

        const compressedBuffer = await readFileAsync(tempOutputPath);

        // Cleanup temporary files
        await unlinkAsync(tempInputPath);
        await unlinkAsync(tempOutputPath);

        return compressedBuffer;
    } catch (error) {
        await unlinkAsync(tempInputPath).catch(() => { });
        throw new Error('Error compressing video: ' + error);
    }
};

// for docker compose
export async function generateVideoThumbnail(buffer: Buffer): Promise<Buffer> {
    const videoDir = '/app/videos'; // Shared volume path inside backend container
    const tempVideoPath = path.join(videoDir, 'temp_video.mp4');
    const tempThumbnailPath = path.join(videoDir, 'temp_thumbnail.png');

    // Write the incoming video buffer to a temporary file
    fs.writeFileSync(tempVideoPath, buffer);

    // FFmpeg command to generate thumbnail (no Docker)
    const ffmpegCommand = `ffmpeg -i ${tempVideoPath} -ss 00:00:01 -vframes 1 -s 1080x1920 ${tempThumbnailPath}`;

    return new Promise((resolve, reject) => {
        exec(ffmpegCommand, (err, stdout, stderr) => {
            if (err) {
                console.error('Error stderr:', stderr);
                reject(`Error generating thumbnail: ${stderr}`);
            } else {
                console.log('FFmpeg stdout:', stdout);
                const thumbnailBuffer = fs.readFileSync(tempThumbnailPath);

                // Cleanup temporary files
                fs.unlinkSync(tempVideoPath);
                fs.unlinkSync(tempThumbnailPath);

                resolve(thumbnailBuffer);
            }
        });
    });
}

export const getVideoDuration = (
    videoPath: string
): Promise<{ duration: number; metadata: ffmpeg.FfprobeData }> => {
    return new Promise((resolve, reject) => {
        ffmpeg(videoPath).ffprobe((err, metadata) => {
            if (err) {
                reject(
                    new Error('Failed to extract video duration: ' + err.message)
                );
            } else {
                const duration = metadata.format.duration; // Duration in seconds
                console.log({ metadata });
                if (duration === undefined) {
                    reject(new Error('Could not determine video duration.'));
                } else {
                    resolve({ duration, metadata });
                }
            }
        });
    });
};

// for local
// export async function generateVideoThumbnail(buffer: Buffer): Promise<Buffer> {
//     const tempVideoPath = path.join(__dirname, 'temp_video.mp4');
//     const tempThumbnailPath = path.join(__dirname, 'temp_thumbnail.png');

//     fs.writeFileSync(tempVideoPath, buffer);

//     const inputDir = path.dirname(tempVideoPath);
//     const outputDir = path.dirname(tempThumbnailPath);
//     const inputFileName = path.basename(tempVideoPath);
//     const outputFileName = path.basename(tempThumbnailPath);

//     const dockerCommand = `docker run --rm -v "${inputDir}:/input" -v "${outputDir}:/output" jrottenberg/ffmpeg -i /input/${inputFileName} -ss 00:00:01 -vframes 1 -s 1080x1920 /output/${outputFileName}`;

//     return new Promise((resolve, reject) => {
//         exec(dockerCommand, (err, stdout, stderr) => {
//             if (err) {
//                 console.error('Error stderr:', stderr);
//                 reject(`Error generating thumbnail: ${stderr}`);
//             } else {
//                 console.log('FFmpeg stdout:', stdout);
//                 const thumbnailBuffer = fs.readFileSync(tempThumbnailPath);

//                 fs.unlinkSync(tempVideoPath);
//                 fs.unlinkSync(tempThumbnailPath);

//                 resolve(thumbnailBuffer);
//             }
//         });
//     });
// }
